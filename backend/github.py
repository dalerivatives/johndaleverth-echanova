"""Server-side GitHub activity, so the contribution heatmap works on every
device instead of on whichever one happened to get lucky.

WHY THIS FILE EXISTS
--------------------
The heatmap used to be fetched by the BROWSER, directly, from two
third-party hosts:

    https://api.github.com/users/<name>
    https://github-contributions-api.jogruber.de/v4/<name>?y=last

On a desktop on home wifi that usually works, which is exactly why it
survived so long. It fails on phones and on other people's devices for
reasons that have nothing to do with the code:

  1. api.github.com allows 60 unauthenticated requests per hour PER IP.
     Mobile carriers put thousands of subscribers behind one CGNAT
     address, so a phone can arrive at a quota someone else already
     spent and be refused on its first ever request.
  2. The calendar host is one person's side project. When it is down,
     slow, or its CORS headers change, every visitor's heatmap breaks at
     once and there is nothing to be done from the client.
  3. Both calls were inside a single Promise.all, so EITHER failing threw
     the whole thing away — a rate-limited profile lookup discarded a
     calendar that had arrived perfectly.
  4. An 8 second timeout is generous on wifi and tight on a train.

Moving the fetch here fixes the class of problem rather than one instance
of it. The server has one IP and one cache, so a hundred visitors cost
the upstreams one request between them; the response is same-origin, so
CORS stops being a factor at all; and the two sources become independent,
so a profile failure costs the profile line and nothing else.

TWO CALENDAR SOURCES, ON PURPOSE
--------------------------------
The primary is the jogruber API, which returns clean JSON. The fallback
is github.com's own contributions fragment — the HTML behind the graph on
a profile page, which carries a data-date and a data-level on every cell.
It needs no key and no third party, so when the nice JSON source is down
the heatmap still fills in. A single source of truth is a single point of
failure, and this one is not under our control.

No new dependency: urllib, like linkpreview.py.
"""

import json
import os
import re
import urllib.error
import urllib.request

TIMEOUT = 10                       # seconds per upstream
MAX_BYTES = 3 * 1024 * 1024        # a year of cells is ~400KB of HTML

# GitHub usernames are alphanumeric with single hyphens, 39 characters at
# most. Validating against that here is not politeness — every one of these
# names is interpolated into a URL this SERVER fetches, so anything looser
# is a server-side request forgery hole with extra steps.
NAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 PortfolioHeatmap/1.0"
)

# The three upstream origins, named rather than inlined so a test can point
# them at a local stub. The parsing here — and particularly the scraper, which
# reads markup nobody promised to keep stable — is the part most worth having
# under test, and it cannot be tested at all if the URLs are hard-coded into
# the functions that use them.
API_BASE = "https://api.github.com"
CAL_BASE = "https://github-contributions-api.jogruber.de"
WEB_BASE = "https://github.com"


def valid_username(name: str) -> bool:
    return bool(NAME_RE.match(name or ""))


def _get(url: str, accept: str, token: str = "") -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": accept,
    })
    # A token lifts api.github.com from 60 requests an hour to 5,000. It is
    # entirely optional: without it this still works, it just has less room.
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return res.read(MAX_BYTES)


def _profile(username: str, token: str) -> dict:
    """Public repo and follower counts. Nice to have, never load-bearing."""
    raw = _get(
        f"{API_BASE}/users/{username}",
        "application/vnd.github+json",
        token,
    )
    data = json.loads(raw.decode("utf-8", "replace"))
    if not isinstance(data, dict):
        raise ValueError("unexpected profile shape")
    return {
        "login": data.get("login") or username,
        "public_repos": data.get("public_repos"),
        "followers": data.get("followers"),
        "avatar_url": data.get("avatar_url") or "",
    }


def _calendar_json(username: str) -> list:
    """Primary source: clean JSON, one entry per day."""
    raw = _get(
        f"{CAL_BASE}/v4/{username}?y=last",
        "application/json",
    )
    data = json.loads(raw.decode("utf-8", "replace"))
    days = data.get("contributions") if isinstance(data, dict) else None
    if not isinstance(days, list) or not days:
        raise ValueError("no contributions in response")
    return [
        {
            "date": str(d.get("date") or ""),
            "count": int(d.get("count") or 0),
            "level": int(d.get("level") or 0),
        }
        for d in days
        if isinstance(d, dict)
    ]


# GitHub's own graph markup. The attribute ORDER differs between the <rect>
# form and the newer <td> form and has changed more than once, so the two
# attributes are pulled out of each cell independently rather than matched in
# sequence — a pattern that assumes "date then level" silently returns zero
# cells the day they swap.
_CELL_RE = re.compile(r"<(?:rect|td)\b[^>]*\bdata-date=[\"'][^\"']+[\"'][^>]*>")
_DATE_RE = re.compile(r"data-date=[\"']([0-9]{4}-[0-9]{2}-[0-9]{2})[\"']")
_LEVEL_RE = re.compile(r"data-level=[\"']([0-4])[\"']")
_COUNT_RE = re.compile(r"data-count=[\"']([0-9]{1,6})[\"']")


def _calendar_scrape(username: str) -> list:
    """Fallback source: GitHub's own contributions fragment.

    This is the HTML behind the graph on a profile page. It is not a
    documented API and the markup has changed shape before, which is why it
    is the fallback and not the primary — but it comes from GitHub itself,
    needs no key, and is not rate-limited the way api.github.com is."""
    raw = _get(
        f"{WEB_BASE}/users/{username}/contributions",
        "text/html",
    )
    html = raw.decode("utf-8", "replace")
    days = []
    for cell in _CELL_RE.findall(html):
        d = _DATE_RE.search(cell)
        if not d:
            continue
        lvl = _LEVEL_RE.search(cell)
        cnt = _COUNT_RE.search(cell)
        level = int(lvl.group(1)) if lvl else 0
        # The markup does not always carry a count. A level with no number
        # is still a usable cell, so the count is inferred rather than
        # dropping the day — but never inflated past what the level says.
        count = int(cnt.group(1)) if cnt else (level and level * 2)
        days.append({"date": d.group(1), "count": count, "level": level})
    if not days:
        raise ValueError("no cells found in contributions markup")
    days.sort(key=lambda x: x["date"])
    return days


def fetch(username: str) -> dict:
    """Everything the heatmap needs, with each piece failing on its own.

    Never raises. The caller gets a dict it can cache and serve either way;
    `ok` means there is a calendar to draw, which is the only part the page
    genuinely cannot do without."""
    token = (os.environ.get("GITHUB_TOKEN") or "").strip()
    out = {
        "username": username,
        "ok": False,
        "profile": None,
        "calendar": {"contributions": []},
        "source": "",
        "errors": [],
    }

    for label, fn in (("api", _calendar_json), ("github", _calendar_scrape)):
        try:
            days = fn(username)
        except Exception as exc:                      # noqa: BLE001
            out["errors"].append(f"calendar/{label}: {_brief(exc)}")
            continue
        out["calendar"] = {"contributions": days}
        out["source"] = label
        out["ok"] = True
        break

    try:
        out["profile"] = _profile(username, token)
    except Exception as exc:                          # noqa: BLE001
        # Deliberately not fatal. This is the call that gets rate-limited,
        # and it only supplies the "N public repos" line under the graph.
        out["errors"].append(f"profile: {_brief(exc)}")

    return out


def _brief(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"HTTP {exc.code}"
    if isinstance(exc, urllib.error.URLError):
        return f"unreachable ({exc.reason})"
    return type(exc).__name__
