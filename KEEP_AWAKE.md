# Keeping the site awake (v111)

Render spins a **free web service down after 15 minutes without inbound
traffic**, and waking it takes **about a minute**. That minute lands on
whoever arrives first — which, for a portfolio, is usually the person you
most wanted it to load for.

There are now three layers against that, and they fail in different ways on
purpose.

---

## Layer 1 — the service keeps itself awake (new, and the reliable one)

`backend/keepalive.py`. While the process is running it fetches its own
public URL every 7 minutes. The request leaves the instance, goes out to the
internet, and comes back in through Render's router — which is what "inbound
traffic" means, so the idle timer is reset and never reaches 15 minutes.

**On Render this needs no configuration.** Render sets `RENDER_EXTERNAL_URL`
for every web service and the heartbeat uses it.

It hits `/api/health/db` rather than `/api/health`, deliberately: that one
runs a `SELECT`, so the same request also counts as activity on the database
and keeps a free Supabase project from pausing underneath a web service that
looks perfectly healthy.

What it cannot do: **wake a service that is already asleep.** Nothing is
running to send the request. That is why layer 2 still exists.

### Is it working?

```
https://johndaleverthechanova.com/api/health/awake
```

```json
{ "enabled": true, "pings": 412, "failures": 0,
  "seconds_since_success": 92, "healthy": true }
```

`seconds_since_success` is the number that matters. Under ~900 means the
instance has had inbound traffic inside Render's 15-minute window and cannot
have spun down. `"enabled": false` means the loop is not running.

---

## Layer 2 — the GitHub cron (kept, with its limits written down)

`.github/workflows/keep-awake.yml`, every 5 minutes. This is the only half
that can bring a *sleeping* service back, so it stays — but it cannot be
trusted to prevent sleep, and it is no longer asked to:

* GitHub's floor is 5 minutes, and scheduled runs "may be delayed during
  periods of high loads" — commonly 5–30 minutes near the top of an hour.
  The cron is offset to `:03` and off `:00`/`:30` for that reason.
* GitHub makes **no timing guarantee** at all, and during an Actions
  incident the ping simply stops.

Its `curl` now allows 120 seconds instead of 30, because if the service *is*
asleep, this request is the one paying for the cold start — timing out at 30
would abandon the wake halfway and report a failure for the exact case the
job exists for. It also prints the heartbeat's status afterwards, so a green
run tells you both halves are alive.

---

## Layer 3 — stopping GitHub switching layer 2 off (new)

`.github/workflows/keep-actions-enabled.yml`.

In a **public** repository, GitHub disables scheduled workflows after
**60 days with no repository activity** — silently. The file stays where it
is, the schedule still looks right, and nothing runs. Months later the site
is slow again and the workflow page looks fine.

Twice a month this checks how long it has been since the last commit, and
**only if that is past 45 days** pushes one empty commit to reset the clock.
A repository you are actively working on never triggers it and gets no extra
history at all.

---

## The cost, because it is a real number

A free workspace gets **750 instance-hours a month**. A month is 730–744
hours. So **one** service running continuously fits, with about 20 hours to
spare.

A second free service running alongside it **does not fit**. If you add one,
set `KEEPALIVE_HOURS` to a window (e.g. `22-14` for overnight and mornings)
rather than discovering the overrun as unexplained downtime at the end of the
month.

The traffic itself is nothing: one request every 7 minutes, ~6,200 a month.
Render's suspension rule is about services generating "an uncommonly high
volume of traffic" as outbound relays; this is not that.

---

## Optional layer 4 — an outside monitor

Worth five minutes if you want a wake path that does not depend on GitHub at
all. Any free uptime service — UptimeRobot, cron-job.org, Better Stack —
pointed at:

```
https://johndaleverthechanova.com/api/health/awake
```

every 5 minutes. That URL gives the monitor a JSON body it can alert on
*and* keeps the service awake by being fetched. This repository does not
configure an external account for you.

---

## If you would rather it simply never slept

Change the **web service's** instance type to a paid compute plan in Render.
That removes spin-down entirely and none of the above is needed. Note that
changing a *workspace* plan is a different setting and does not do this.
`render.yaml` still says `plan: free` and nothing here changes your billing.

---

## Settings

All optional; on Render the defaults are correct.

| Variable | Default | What it does |
|---|---|---|
| `KEEPALIVE` | on | `off`/`0`/`false` disables the heartbeat |
| `KEEPALIVE_URL` | `RENDER_EXTERNAL_URL` + `/api/health/db` | What to fetch. Required off Render |
| `KEEPALIVE_MINUTES` | `7` | Interval, clamped to 2–12 |
| `KEEPALIVE_HOURS` | unset | UTC window, e.g. `22-14` |

Pull-request previews are skipped automatically (`IS_PULL_REQUEST`), so a
throwaway preview never burns the same free hours as the live site.

---

Sources: [Render free tier](https://render.com/docs/free) ·
[Render default environment variables](https://render.com/docs/environment-variables) ·
[GitHub scheduled-workflow limits](https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
