# Render wake-up setup (v66)

The keep-awake workflow was present in v65. It still targeted
https://portfolio-ap9x.onrender.com. V66 defaults to the supplied custom domain:
https://johndaleverthechanova.com/api/health/db

## Activate after uploading

1. Copy the CONTENTS of Johndaleverth_Portfolio to the root of your GitHub
   repository, including the hidden .github folder. A workflow nested inside
   Johndaleverth_Portfolio/.github will not run if that folder is not repo root.
2. Push to the default branch. In GitHub Actions, enable workflows if asked.
3. Open keep-awake and choose Run workflow. Confirm that the check passes.
4. If necessary, set the repository Actions variable KEEP_AWAKE_URL to your
   actual public /api/health/db endpoint. No admin key is needed.
5. For more regular checks, configure an external uptime monitor to GET that
   endpoint every five minutes. This ZIP does not configure an external account.

The workflow runs every five minutes, offset from the hour. It validates JSON
and treats an unavailable database as a failure. GitHub may delay or disable
scheduled workflows, so this reduces cold starts but cannot promise no sleep.
The /api/presence requests also keep traffic flowing while visible visitors
are connected; browser timers stop being reliable after tabs close or suspend.

Render says free web services spin down after 15 minutes without inbound
traffic, and waking takes about one minute. If you observed a one-minute idle
period, check service logs for restarts, deployments and which service the
custom domain targets. That symptom alone does not establish the cause.

For no idle spin-down, change the WEB SERVICE's instance type to a paid compute
plan in Render. Changing a workspace plan is not the same setting. V66 leaves
plan: free intact and does not change billing or deploy anything automatically.

The custom Trevelade loader runs after Render serves the HTML. It cannot appear
in place of Render's own cold-start page while the web process is asleep.
Free workspaces share 750 instance-hours per month; continuous checks consume
that allowance. Database suspension and hosting availability remain separate.

Source: https://render.com/docs/free
