#!/usr/bin/env bash
# =============================================================================
#  Deploy a new version of the portfolio on the Oracle VM.
#
#      sudo /opt/portfolio/deploy/update.sh
#
#  Pulls, reinstalls anything new, restarts, and checks the app actually came
#  back. If it didn't, it rolls back to the commit that was running before and
#  restarts that instead — so a bad push doesn't leave the site down.
# =============================================================================
set -euo pipefail

APP_USER="${APP_USER:-portfolio}"
APP_DIR="${APP_DIR:-/opt/portfolio}"
APP_PORT="${APP_PORT:-8000}"

die(){ echo "ERROR: $*" >&2; exit 1; }
say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -d "$APP_DIR/.git" ]] || die "$APP_DIR is not a git checkout"

if   [[ -f "$APP_DIR/backend/main.py" ]]; then RUN_DIR="$APP_DIR"
elif [[ -f "$APP_DIR/Johndaleverth_Portfolio_FullStack/backend/main.py" ]]; then RUN_DIR="$APP_DIR/Johndaleverth_Portfolio_FullStack"
else die "backend/main.py not found under $APP_DIR"; fi

PREV="$(git -C "$APP_DIR" rev-parse HEAD)"
say "Currently running ${PREV:0:8}"

say "Pulling"
git -C "$APP_DIR" fetch --depth 1 origin
git -C "$APP_DIR" reset --hard origin/HEAD
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
NEW="$(git -C "$APP_DIR" rev-parse HEAD)"

if [[ "$PREV" == "$NEW" ]]; then
  say "Already up to date (${NEW:0:8}); restarting anyway"
else
  say "Updating ${PREV:0:8} -> ${NEW:0:8}"
fi

say "Installing dependencies"
sudo -u "$APP_USER" "$RUN_DIR/.venv/bin/pip" install --quiet -r "$RUN_DIR/requirements.txt"

say "Restarting"
systemctl restart portfolio.service

# Give it a few seconds, then insist it actually answers.
ok=0
for _ in $(seq 1 10); do
  sleep 2
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" || echo 000)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
done

if [[ "$ok" == "1" ]]; then
  say "Healthy on ${NEW:0:8}"
  exit 0
fi

# ---- rollback ---------------------------------------------------------------
echo
echo "The new version did not come up. Rolling back to ${PREV:0:8}." >&2
journalctl -u portfolio --no-pager -n 25 || true
git -C "$APP_DIR" reset --hard "$PREV"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" "$RUN_DIR/.venv/bin/pip" install --quiet -r "$RUN_DIR/requirements.txt" || true
systemctl restart portfolio.service
sleep 5
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" || echo 000)
[[ "$code" == "200" ]] && die "rolled back to ${PREV:0:8}; the site is up on the previous version" \
                       || die "rolled back to ${PREV:0:8} but it is still not answering — check journalctl -u portfolio"
