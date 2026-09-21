# Portfolio v111 — it stops going to sleep

## The problem, measured rather than assumed

Render spins a **free web service down after 15 minutes without inbound
traffic**, and waking it takes **about a minute**.

The repo was guarding that 15-minute window with a GitHub Actions cron, and
that was never going to hold, for three documented reasons:

* GitHub's finest schedule is every 5 minutes, and scheduled runs *"may be
  delayed during periods of high loads"* — commonly 5–30 minutes near the
  top of an hour.
* GitHub gives **no timing guarantee** at all. During an Actions incident the
  ping simply stops.
* In a **public** repository, scheduled workflows are switched off
  automatically after **60 days with no pushes** — silently. The file stays
  where it is, the schedule still looks right, and nothing runs. That failure
  is invisible until someone notices the site is slow again months later.

A 15-minute window guarded by a timer that is routinely half an hour late is
not a guard.

## The fix: the service now keeps itself awake

`backend/keepalive.py` — new. While the process is running it fetches its own
public URL every 7 minutes. The request leaves the instance, goes out to the
internet and comes back in through Render's router, which is what "inbound
traffic" means — so the idle timer resets and never reaches 15 minutes.

**On Render this needs no configuration at all.** Render sets
`RENDER_EXTERNAL_URL` for every web service and the heartbeat uses it. Off
Render it stays completely dormant unless you set `KEEPALIVE_URL`, so a local
run and any test suite are untouched.

Details that matter:

* It pings `/api/health/db`, not `/api/health`. That one runs a `SELECT`, so
  the same request also counts as activity on the database — otherwise the
  web service stays up for months while a free Supabase project quietly
  pauses underneath it and the site breaks on the next real visit.
* Seven minutes, not ten: **two** consecutive misses still land inside the
  15-minute window. Configurable, clamped to 2–12.
* Jittered ±45s so it never lines up with the GitHub cron.
* Pull-request previews are skipped automatically, so a throwaway preview
  never burns the same free hours as the live site.
* A failed ping is logged once, not every seven minutes, and can never take
  the app down with it. Verified against a dead target: one line in the log,
  site still serving 200s.

**It cannot wake a service that is already asleep** — nothing is running to
send the request. That is still the GitHub cron's job, which is why both
halves exist and why the cron was kept.

## You can now check instead of hoping

```
https://johndaleverthechanova.com/api/health/awake
```

```json
{ "enabled": true, "pings": 412, "failures": 0,
  "seconds_since_success": 92, "healthy": true }
```

`seconds_since_success` under ~900 means the instance has had inbound traffic
inside Render's window and cannot have spun down. The keep-awake workflow
prints this after every ping, so a green run tells you both halves are alive.

## The cron, kept and hardened

* `--max-time` raised from 30s to 120s. If the service *is* asleep, that
  request is the one paying for the cold start — Render quotes about a minute
  for it. Timing out at 30 would abandon the wake halfway and report failure
  for the exact case the job exists for.
* Three retries instead of one.
* A second step that reads and reports the heartbeat's state, which never
  fails the job.

## New: stopping GitHub switching the cron off

`.github/workflows/keep-actions-enabled.yml`. Twice a month it checks how
long it has been since the last commit and — **only past 45 days** — pushes
one empty commit to reset the 60-day clock. A repo you are working on
normally never triggers it and gets no extra history at all.

## The cost, because on a free plan it is a real number

A free workspace gets **750 instance-hours a month**; a month is 730–744
hours. So **one** always-on service fits, with about 20 hours to spare. A
second free service running alongside it does not — `KEEPALIVE_HOURS` exists
for that case. The traffic itself is ~6,200 requests a month, nowhere near
Render's "uncommonly high volume" suspension rule.

`KEEP_AWAKE.md` has all of it, including the optional outside monitor and the
one setting that removes spin-down entirely.

---

# Also fixed, found while testing

## The robot step was crediting you for a stranger's hit

The arena is shared. The tour's robot step listened for `robot-hp`, which
fires when **anyone** in the world damages the unit — so on a robot someone
else had already hit, the step completed on the first poll and the tour
congratulated the visitor for a swing they had never taken, then moved on.

There is now a `robot-hit-self` event, dispatched only when the server has
accepted a hit from *this* visitor, and the step waits for that.

## The hand lagged behind anything that scrolled

Two causes, both mine from v110.

The tour listened for `scroll` on `window`. Scroll events **do not bubble**,
so that only ever heard the page scrolling — and several things the tour
points at live inside their own scrolling panel. Now it listens in the
capture phase on the document, which hears every scroll in the page whichever
element did it.

And the ease I put on the hand's position — right for walking it around the
theme dial — meant that during a smooth scroll the finger spent the whole
scroll a quarter-second behind its target. The ease is now opt-in, set by the
step that wants it. Sampled through the scroll settle on the steps that move:
**every sample on target, where two of three steps previously failed.**

---

## Still on you

1. **Purge the CDN cache.** Nothing in the code can evict it.
2. After deploying, open `/api/health/awake` once and confirm
   `"enabled": true`. That is the whole verification.
