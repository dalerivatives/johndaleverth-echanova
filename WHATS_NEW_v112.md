# Portfolio v112 — what you saw, and one thing worth hardening

## First: the startup page you saw was your own deploy

Checked against your live site, not guessed:

* You pushed at **18:00:37 UTC**.
* The service process started at **18:01:54 UTC** — 77 seconds later.
* You looked at the site in that window.

A deploy restarts the service. While it restarts there is nothing running to
serve a page, so Render serves its own. **Every deploy does this and nothing
in the code can prevent it** — a heartbeat inside a process cannot run before
the process exists.

## The keep-alive is working

Straight from the origin, 22 minutes after that deploy:

```json
{ "enabled": true,
  "running_since": "2026-09-21T18:01:54+00:00",
  "pings": 3, "failures": 0,
  "seconds_since_success": 11, "healthy": true }
```

`running_since` had not moved. Same process, alive the whole time, three
heartbeats, nothing failed.

Your GitHub runs say the same thing from the outside. Before the deploy they
were taking **48 and 49 seconds** — that is the run paying for a cold start,
which means the service had been asleep. Every run since the deploy has taken
**5 to 9 seconds**. That is the difference between waking a sleeping service
and talking to one that was already awake.

So: it slept before, it does not now.

## What changed in this version

One thing, and it protects exactly what you just asked about.

`/api/health`, `/api/health/db` and `/api/health/awake` now send `no-store`,
including the CDN-specific forms this project has needed before
(`CDN-Cache-Control`, `Cloudflare-CDN-Cache-Control`).

Why it matters: those endpoints had no cache headers at all. If your CDN ever
decided to hold on to `/api/health/db`, every keep-alive ping would be
answered at the edge and **never reach Render**. The GitHub run goes green,
an uptime monitor goes green, and the service sleeps anyway — a failure that
is invisible from outside, which is the worst kind. A cached
`/api/health/awake` is the same problem in reverse: it would report an old
snapshot and you would be reading a number that stopped being true.

This is the same class of bug as the favicon and the stale HTML earlier in
this project, and it costs four headers to close.

## You chose 24/7 — so, one thing to check

Render gives a **workspace** 750 free instance-hours a month. A 31-day month
is 744. Running continuously uses essentially all of it, leaving about six
hours of margin.

When a workspace runs out, Render suspends **every free service in it** until
the month resets — not the busiest one, all of them. Which is worse than
sleeping.

So the one thing worth checking in your Render dashboard: **this portfolio
should be the only free service in the workspace.** If you ever add a second,
set `KEEPALIVE_HOURS` (see `KEEP_AWAKE.md`) — the budget does not stretch to
two.

September is safe either way: only nine days remain in the month.

---

## Carried over from v111

* The service keeps itself awake from inside — `backend/keepalive.py`.
* The GitHub cron kept as the only thing that can wake a *sleeping* service,
  with its timeout raised from 30s to 120s so it can actually pay a cold
  start instead of giving up halfway through one.
* `keep-actions-enabled.yml`, so GitHub never silently switches that cron off
  after 60 days without a push.
* The tour's robot step no longer credits you for a stranger's hit.
* The pointing hand tracks controls that scroll inside their own panel.
