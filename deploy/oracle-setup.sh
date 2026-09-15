#!/usr/bin/env bash
# =============================================================================
#  Portfolio -> Oracle Cloud Always Free (Ubuntu, Ampere ARM)
# -----------------------------------------------------------------------------
#  Takes a bare Ubuntu instance to a running portfolio on HTTPS.
#
#  Run it ON THE VM, as the default `ubuntu` user:
#
#      curl -fsSL -o setup.sh <raw-url-of-this-file>
#      chmod +x setup.sh
#      sudo DOMAIN=johndaleverthechanova.com \
#           REPO=https://github.com/dalerivatives/<your-repo>.git \
#           ADMIN_KEY='<a long random secret>' \
#           DATABASE_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
#           ./setup.sh
#
#  Re-running it is safe: every step checks before it acts.
# =============================================================================
set -euo pipefail

# ---- inputs -----------------------------------------------------------------
DOMAIN="${DOMAIN:-}"
REPO="${REPO:-}"
ADMIN_KEY="${ADMIN_KEY:-}"
DATABASE_URL="${DATABASE_URL:-}"
APP_USER="${APP_USER:-portfolio}"
APP_DIR="${APP_DIR:-/opt/portfolio}"
APP_PORT="${APP_PORT:-8000}"

die(){ echo "ERROR: $*" >&2; exit 1; }
say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -n "$DOMAIN" ]] || die "set DOMAIN=yourdomain.com"
[[ -n "$REPO"   ]] || die "set REPO=https://github.com/you/repo.git"
[[ -n "$ADMIN_KEY" ]] || die "set ADMIN_KEY to a real secret (never leave it as changeme123)"
[[ ${#ADMIN_KEY} -ge 16 ]] || die "ADMIN_KEY is too short; use at least 16 characters"
[[ "$ADMIN_KEY" != "changeme123" ]] || die "ADMIN_KEY is still the published default"

say "Deploying $DOMAIN from $REPO"

# ---- packages ---------------------------------------------------------------
say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip git curl ca-certificates \
                       debian-keyring debian-archive-keyring apt-transport-https

# Caddy: a web server that gets and renews Let's Encrypt certificates on its
# own. nginx + certbot does the same job in about four more moving parts, and
# the renewal cron is the part that silently rots.
if ! command -v caddy >/dev/null 2>&1; then
  say "Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# ---- app user and code ------------------------------------------------------
id -u "$APP_USER" >/dev/null 2>&1 || { say "Creating user $APP_USER"; useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"; }

say "Fetching the application"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin
  git -C "$APP_DIR" reset --hard origin/HEAD
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi
mkdir -p "$APP_DIR/uploads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# The app lives one level down in some zips and at the root in others.
if   [[ -f "$APP_DIR/backend/main.py" ]]; then RUN_DIR="$APP_DIR"
elif [[ -f "$APP_DIR/Johndaleverth_Portfolio_FullStack/backend/main.py" ]]; then RUN_DIR="$APP_DIR/Johndaleverth_Portfolio_FullStack"
else die "backend/main.py not found under $APP_DIR — check the repo layout"; fi
say "Application root: $RUN_DIR"

# ---- python env -------------------------------------------------------------
say "Building the virtualenv (all wheels are aarch64 — nothing compiles)"
sudo -u "$APP_USER" python3 -m venv "$RUN_DIR/.venv"
sudo -u "$APP_USER" "$RUN_DIR/.venv/bin/pip" install --quiet --upgrade pip wheel
sudo -u "$APP_USER" "$RUN_DIR/.venv/bin/pip" install --quiet -r "$RUN_DIR/requirements.txt"

# ---- secrets ----------------------------------------------------------------
# Kept out of the unit file so `systemctl cat` doesn't print them.
say "Writing /etc/portfolio.env (0600, root-owned)"
{
  echo "ADMIN_KEY=${ADMIN_KEY}"
  [[ -n "$DATABASE_URL" ]] && echo "DATABASE_URL=${DATABASE_URL}"
  echo "# DEV is deliberately unset: it turns on live reload, which would have"
  echo "# every visitor polling a directory listing."
} > /etc/portfolio.env
chmod 600 /etc/portfolio.env

# ---- service ----------------------------------------------------------------
# ONE worker, on purpose. The live viewer count, the robot's tap buffer and the
# rate limiters live in process memory; a second worker keeps its own copies and
# visitors on different workers stop seeing each other's taps.
say "Installing the systemd service"
cat > /etc/systemd/system/portfolio.service <<UNIT
[Unit]
Description=Trevelade portfolio (FastAPI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${RUN_DIR}
EnvironmentFile=/etc/portfolio.env
ExecStart=${RUN_DIR}/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port ${APP_PORT} --workers 1
Restart=always
RestartSec=3

# It only ever needs to read its own directory and write uploads/ and the
# SQLite file, so everything else on the box is off limits.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${RUN_DIR}
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now portfolio.service

# ---- reverse proxy + TLS ----------------------------------------------------
say "Configuring Caddy for ${DOMAIN}"
cat > /etc/caddy/Caddyfile <<CADDY
# Caddy obtains and renews the certificate by itself. Both the apex and www
# are listed, so both resolve; www redirects so there is one canonical URL.
${DOMAIN}, www.${DOMAIN} {
	encode zstd gzip

	@www host www.${DOMAIN}
	redir @www https://${DOMAIN}{uri} permanent

	reverse_proxy 127.0.0.1:${APP_PORT} {
		# The robot's live tap feed is Server-Sent Events. Buffering a stream
		# would hold each event until the buffer filled, so the feed must pass
		# through untouched.
		flush_interval -1
	}
}
CADDY

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy

# ---- firewall ---------------------------------------------------------------
# THE ORACLE TRAP. Oracle's Ubuntu images ship with an iptables REJECT rule for
# everything except SSH, and it survives opening ports in the console's security
# list. People open 80/443 in the web UI, see nothing, and assume DNS. Both the
# console rule AND this one are required.
say "Opening ports 80/443 on the instance firewall"
if command -v netfilter-persistent >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport 80  -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
  netfilter-persistent save >/dev/null 2>&1 || true
  echo "   iptables rules added and persisted"
else
  echo "   netfilter-persistent not present; if the site is unreachable, check the OS firewall"
fi

# ---- verify -----------------------------------------------------------------
say "Verifying"
sleep 4
local_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" || echo 000)
echo "   app on 127.0.0.1:${APP_PORT}/api/health -> HTTP ${local_code}"
[[ "$local_code" == "200" ]] || { systemctl --no-pager -l status portfolio.service | tail -25; die "the app did not come up"; }

systemctl is-active --quiet caddy && echo "   caddy: active" || die "caddy is not running"

cat <<DONE

-------------------------------------------------------------------
 Done.

   Site      https://${DOMAIN}
   Editor    https://${DOMAIN}/editor.html
   Health    https://${DOMAIN}/api/health

 The certificate is issued on the first request to the domain, so
 the very first load can take a few seconds. If it fails, DNS is
 almost always the cause — Caddy cannot prove ownership until the
 A record resolves to this machine's public IP.

 Useful afterwards:
   sudo systemctl status portfolio
   sudo journalctl -u portfolio -f
   sudo journalctl -u caddy -f

 To deploy a new version:
   sudo ${APP_DIR}/deploy/update.sh
-------------------------------------------------------------------
DONE
