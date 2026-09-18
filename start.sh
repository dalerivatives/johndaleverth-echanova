#!/usr/bin/env bash
# Local run script for macOS/Linux. Windows users: use start.bat instead.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "Creating a virtual environment in .venv ..."
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing/checking dependencies ..."
pip install -q -r requirements.txt

# ADMIN_KEY has no shared default any more - the server rejects the old
# "changeme123" outright, because it was printed in this repo's README and
# /editor.html is a public URL. For LOCAL runs a key is still needed to open
# the editor at all, so one is generated once and kept in .admin_key next to
# this script (gitignored). Deployed copies set the variable properly instead.
if [ -z "$ADMIN_KEY" ]; then
  if [ ! -f ".admin_key" ]; then
    python3 -c "import secrets;print(secrets.token_urlsafe(24))" > .admin_key
    chmod 600 .admin_key 2>/dev/null || true
  fi
  export ADMIN_KEY="$(cat .admin_key)"
  echo ""
  echo "[i] Local editor key (from .admin_key):  $ADMIN_KEY"
  echo "    Sign in at http://127.0.0.1:8000/editor.html with that."
  echo ""
fi

# If a previous run was closed with the terminal window instead of Ctrl+C,
# its server can be left running in the background on port 8000. This run
# would then fail to bind the port while your browser still opens fine and
# quietly hits that old leftover server - so newer changes look like they
# "didn't apply" when you're really still talking to the old process. Stop
# any such leftover first so the server answering your browser is always
# the one this script just started.
OLD_PID="$(lsof -ti tcp:8000 2>/dev/null || true)"
if [ -n "$OLD_PID" ]; then
  echo "Found an old server still using port 8000 (PID $OLD_PID) - stopping it ..."
  kill -9 $OLD_PID 2>/dev/null || true
fi

# ---------------------------------------------------------------------
# LIVE RELOAD
# DEV=1 turns on two things that only make sense while you're editing:
#   * uvicorn --reload restarts the server when a .py file changes
#   * the page polls the server and refreshes itself when any file in
#     static/ changes - so editing HTML, CSS or JS updates the browser
#     without you touching it.
# Neither is on in a deployed copy; DEV is set here, not in the code.
# ---------------------------------------------------------------------
export DEV=1
# Local computers can use the bundled neural model. Hosted deployments stay
# static by default unless a larger-memory instance explicitly opts in.
export SPEECH_MODE=dynamic

( sleep 1 && command -v open >/dev/null 2>&1 && open "http://127.0.0.1:8000" || true ) &
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir backend --reload-dir static
