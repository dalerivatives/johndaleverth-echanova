"""
KEEPING THE FREE INSTANCE AWAKE, FROM INSIDE IT
================================================

Render spins a free web service down after **15 minutes without inbound
traffic**, and bringing it back takes about a minute. For a portfolio that
is the worst possible failure: the one visitor who matters arrives, waits
out a cold start on a blank Render page, and leaves.

The repository already pings the site from a GitHub Actions cron. That is
worth keeping — it is the only half of this that can *wake* a service that
has already gone to sleep — but on its own it cannot be trusted to prevent
sleep, for three documented reasons:

  * the finest schedule GitHub accepts is every 5 minutes, and scheduled
    runs "may be delayed during periods of high loads", commonly by 5-30
    minutes near the top of an hour;
  * in a **public** repository, scheduled workflows are switched off
    automatically after 60 days with no pushes — silently, with the
    workflow still sitting there looking healthy;
  * it is one provider. When Actions has an incident, the ping stops.

A 15-minute window being guarded by a timer that is routinely half an hour
late is not a guard at all.

So the service also keeps *itself* awake. While the process is running it
fetches its own public URL every few minutes. The request leaves the
instance, goes out to the public internet, and comes back in through
Render's router — which is what "inbound traffic" means, so the idle timer
is reset and never reaches 15 minutes.

What this can and cannot do, stated plainly:

  * It CANNOT wake a service that is already asleep. Nothing is running to
    send the request. That is precisely the job the GitHub cron still does,
    and why both halves are here.
  * It CAN stop the service ever reaching that state in the first place,
    which is the half that was missing.

Cost, because on a free plan this is a real number and not a footnote: a
workspace gets 750 free instance-hours a month and a month is 730-744
hours, so ONE service running continuously fits, with roughly 20 hours to
spare. A second free service running alongside it does not. If you add
one, set KEEPALIVE_HOURS to a daytime window rather than paying for the
overrun in surprise downtime at the end of the month.

The traffic itself is negligible — one request every seven minutes, about
6,200 a month — and nowhere near Render's "uncommonly high volume of
traffic" suspension rule, which is aimed at services being used as
outbound relays.

Configuration, all optional:

  KEEPALIVE          "off"/"0"/"false" disables it outright.
  KEEPALIVE_URL      What to fetch. Defaults to RENDER_EXTERNAL_URL +
                     /api/health/db, which Render sets for you, so on
                     Render this needs no configuration at all.
  KEEPALIVE_MINUTES  Interval, default 7. Two consecutive misses still
                     land inside the 15-minute window; ten would not.
  KEEPALIVE_HOURS    Optional UTC window, e.g. "22-14" to run overnight
                     and through the morning. Outside it the loop idles.

Nothing here is imported unless the app starts, and with no Render
environment and no KEEPALIVE_URL it does nothing at all, so a local run and
the test suite are unaffected.
"""

from __future__ import annotations

import asyncio
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

# The deliberate choice of endpoint. /api/health returns a constant without
# opening a connection, so it would keep the WEB service awake while the
# database quietly paused underneath it. /api/health/db runs one SELECT, so
# a single request counts as activity on both halves of the stack.
DEFAULT_PATH = "/api/health/db"
DEFAULT_MINUTES = 7.0
TIMEOUT_SECONDS = 25

_FALSE = {"0", "off", "false", "no", "disabled"}


class _State:
    """What the loop has actually been doing, so it can be inspected over
    HTTP instead of guessed at from the absence of complaints."""

    def __init__(self) -> None:
        self.enabled = False
        self.url = ""
        self.interval = DEFAULT_MINUTES
        self.window = ""
        self.started_at: float | None = None
        self.pings = 0
        self.failures = 0
        self.last_ok: float | None = None
        self.last_error: str = ""
        self.last_status: int | None = None
        self.next_due: float | None = None

    def report(self) -> dict:
        def when(ts: float | None) -> str | None:
            if not ts:
                return None
            return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")

        return {
            "enabled": self.enabled,
            "url": self.url,
            "every_minutes": self.interval,
            "window_utc": self.window or "always",
            "running_since": when(self.started_at),
            "pings": self.pings,
            "failures": self.failures,
            "last_success": when(self.last_ok),
            "last_status": self.last_status,
            "last_error": self.last_error or None,
            "next_due": when(self.next_due),
            "seconds_since_success": (
                round(time.time() - self.last_ok) if self.last_ok else None
            ),
        }


state = _State()


def _resolve_url() -> str:
    """Explicit setting first, then the URL Render hands every web service.

    RENDER_EXTERNAL_URL is always the onrender.com address, never a custom
    domain — which is what we want. It reaches the same router by the
    shortest path, with no DNS or CDN in front of it to cache the response
    and quietly stop the traffic ever arriving.
    """
    explicit = (os.getenv("KEEPALIVE_URL") or "").strip()
    if explicit:
        return explicit

    base = (os.getenv("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    if not base:
        return ""
    return base + DEFAULT_PATH


def _resolve_window() -> tuple[int, int] | None:
    raw = (os.getenv("KEEPALIVE_HOURS") or "").strip()
    if not raw or "-" not in raw:
        return None
    try:
        start, end = (int(part) for part in raw.split("-", 1))
    except ValueError:
        return None
    if not (0 <= start <= 23 and 0 <= end <= 23):
        return None
    return start, end


def _inside(window: tuple[int, int] | None, hour: int) -> bool:
    if window is None:
        return True
    start, end = window
    if start == end:
        return True
    if start < end:
        return start <= hour < end
    # Wraps midnight, e.g. 22-14.
    return hour >= start or hour < end


def _fetch(url: str) -> int:
    """One blocking GET, run off the event loop. Returns the status code.

    Redirects are followed, because a custom KEEPALIVE_URL pointing at a
    bare domain will usually redirect once, and a 301 that is never
    followed still counts as traffic but tells us nothing about whether
    the app behind it is alive.
    """
    request = urllib.request.Request(
        url,
        headers={
            # Named, so a line in the access log is self-explanatory rather
            # than an anonymous python-urllib hit every seven minutes.
            "User-Agent": "portfolio-keepalive/1.0 (+self-ping)",
            "Cache-Control": "no-cache",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        response.read(2048)
        return response.status


async def _loop() -> None:
    window = _resolve_window()
    interval = state.interval * 60.0
    healthy: bool | None = None          # last reported state, to log only changes

    # A short wait before the first ping: the app has just booted, the real
    # request that woke it is still being served, and there is no sense
    # competing with it.
    await asyncio.sleep(20)

    while True:
        try:
            hour = datetime.now(timezone.utc).hour
            if _inside(window, hour):
                loop = asyncio.get_running_loop()
                try:
                    status = await loop.run_in_executor(None, _fetch, state.url)
                    state.pings += 1
                    state.last_status = status
                    if 200 <= status < 400:
                        state.last_ok = time.time()
                        state.last_error = ""
                        if healthy is not True:
                            print(f"[keepalive] awake — self-ping {state.url} -> {status}")
                            healthy = True
                    else:
                        raise urllib.error.HTTPError(state.url, status, "unexpected status", None, None)
                except Exception as exc:  # noqa: BLE001 - a heartbeat never raises upward
                    state.failures += 1
                    state.last_error = f"{type(exc).__name__}: {exc}"[:200]
                    if healthy is not False:
                        print(f"[keepalive] self-ping failed: {state.last_error}")
                        healthy = False

            # Jitter, so this never lines up with the GitHub cron and the two
            # halves land at different points in the 15-minute window instead
            # of doubling up and then leaving a longer gap.
            delay = interval + random.uniform(-45, 45)
            state.next_due = time.time() + delay
            await asyncio.sleep(delay)

        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - never let the loop die
            print(f"[keepalive] loop error, continuing: {exc}")
            await asyncio.sleep(60)


def attach(app) -> None:
    """Wire the heartbeat to the app's lifecycle.

    Deliberately quiet about being switched off: a local run should not
    print a warning about a production-only feature every time it starts.
    """
    switch = (os.getenv("KEEPALIVE") or "").strip().lower()
    if switch in _FALSE:
        return

    # A pull-request preview is a throwaway that would burn the same free
    # instance-hours as the real site. Render marks them for us.
    if (os.getenv("IS_PULL_REQUEST") or "").strip().lower() == "true":
        return

    url = _resolve_url()
    if not url:
        return

    try:
        minutes = float(os.getenv("KEEPALIVE_MINUTES") or DEFAULT_MINUTES)
    except ValueError:
        minutes = DEFAULT_MINUTES
    # Below two minutes is pointless noise; above twelve leaves no room for a
    # single missed beat inside Render's fifteen.
    minutes = max(2.0, min(minutes, 12.0))

    state.enabled = True
    state.url = url
    state.interval = minutes
    window = _resolve_window()
    state.window = f"{window[0]:02d}-{window[1]:02d}" if window else ""

    task: dict[str, asyncio.Task] = {}

    @app.on_event("startup")
    async def _start() -> None:  # pragma: no cover - lifecycle glue
        state.started_at = time.time()
        print(
            f"[keepalive] on — {state.url} every {minutes:g} min"
            + (f" during {state.window} UTC" if state.window else "")
        )
        task["t"] = asyncio.create_task(_loop(), name="keepalive")

    @app.on_event("shutdown")
    async def _stop() -> None:  # pragma: no cover - lifecycle glue
        running = task.get("t")
        if not running:
            return
        running.cancel()
        try:
            await running
        except (asyncio.CancelledError, Exception):
            pass
        state.enabled = False
