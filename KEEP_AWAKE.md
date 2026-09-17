# Keeping the site awake on Render's free tier

## Two things sleep here, not one

**Render** spins a free web service down after **15 minutes** without inbound
traffic — not an hour. Waking it takes **30–60 seconds**, which is the
blank-looking pause someone gets opening your link cold.

**Supabase** pauses a Free-plan project after roughly **7 days** of low
activity, and a paused project has to be restored by hand from the dashboard.

These two combine into a trap. A monitor pinging `/api/health` keeps Render
awake forever — that endpoint returns a constant and never opens a database
connection. Supabase sees no activity, pauses after a week, and the next real
visitor gets an error **while your uptime monitor still reports 100%**.

So ping **`/api/health/db`**. It runs one `SELECT 1`, which counts as activity
on both halves of the stack. It returns:

- `200 {"status":"ok","db":"ok"}` — both awake
- `503 {"status":"degraded","db":"unreachable"}` — the web app is fine and the
  database is not, which almost always means Supabase paused

That distinction is the point: when it breaks you immediately know which half
broke. `/api/health` still exists for plain liveness checks.

## Why the app can't just ping itself

The obvious idea is a background thread inside the app that calls its own
URL on a timer. It doesn't work, for a reason that's worth understanding:
once the service is asleep **there is no process running to send the ping**.
A self-ping can only ever run while the service is already awake, so it can
never wake anything up — and Render counts *inbound* traffic, so a request a
service makes to itself is not the signal that keeps it alive anyway.

The ping has to come from somewhere else. That's the whole problem.

## The budget — read this before turning anything on

A free workspace gets **750 instance-hours per month**, shared across **every
free web service in it**. A calendar month is about **730 hours**.

So keeping one service awake around the clock consumes roughly 730 of your
750 hours and leaves about 20 hours of headroom for the entire month. That is
fine for a single portfolio. It stops being fine the moment you add a second
free web service — the two together will burn the allowance and Render
suspends them for the rest of the month.

If you ever spin up a second free service, turn the pinger off or accept the
cold starts.

A spun-down service consumes no hours, which is exactly why the free tier
sleeps in the first place.

## Option A — an uptime monitor (recommended)

This is the reliable one. Any uptime service works; they exist to do exactly
this and they run on real schedulers.

1. Sign up somewhere with a free tier (UptimeRobot, Better Stack, Odown,
   Cronitor — all have one).
2. Add an **HTTP(s) monitor**.
3. URL: `https://portfolio-ap9x.onrender.com/api/health/db`
4. Interval: **5 minutes**. Comfortably inside the 15-minute window even if a
   check is missed.

Use the `onrender.com` hostname rather than your custom domain. If you ever
switch Cloudflare's proxy to the orange cloud, a cached response could
satisfy the monitor without the request ever reaching Render — and the
service would sleep while the monitor still reported "up".

`/api/health/db` runs a single `SELECT 1`. Pinging it every 5 minutes costs
essentially nothing and is the only ping that keeps Supabase alive too.

## Option B — the GitHub Actions workflow in this repo

`.github/workflows/keep-awake.yml` pings every 10 minutes using the repo you
already have. No third-party signup.

Two honest caveats:

- **GitHub's scheduled runners are queued, not guaranteed.** Under load a
  `*/10` cron can drift well past 15 minutes, and the service naps anyway.
- **GitHub disables scheduled workflows after 60 days of repository
  inactivity.** If you stop pushing to the repo, the pinger quietly stops.
  GitHub emails you first.

It's a good backup and costs nothing on a public repository. For something
you're putting on a résumé, use Option A as the primary.

To point it at a different URL, set a repository variable named
`KEEP_AWAKE_URL` under **Settings → Secrets and variables → Actions →
Variables**.

## Don't overdo it

Render's docs note they may suspend services that generate an "uncommonly
high volume of traffic over the public internet." A request every 5 minutes
is nothing. A request every 10 seconds is asking for trouble. There is no
benefit to pinging faster than the 15-minute window requires.

## The alternative worth considering

Keeping a free instance awake with a pinger is a workaround for a limit that
exists on purpose. If the site matters for job applications, Render's
cheapest paid instance removes cold starts entirely, removes the 750-hour
ceiling, and frees you from depending on an external pinger that can silently
stop. The pinger is the right answer while the site is free; it isn't a
permanent architecture.
