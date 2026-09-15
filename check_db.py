"""
Preflight for a hosted database (Supabase, Render, Neon, anything Postgres).

Run this BEFORE you deploy. It connects with exactly the code the app uses, so
if it passes here it will work there - and if it fails, it names which of the
handful of usual causes it is, instead of leaving you reading a stack trace on
a host you cannot attach a debugger to.

    Windows:      set DATABASE_URL=postgresql://...
                  .venv\\Scripts\\python check_db.py

    macOS/Linux:  DATABASE_URL='postgresql://...' .venv/bin/python check_db.py

Nothing is left behind: it creates one scratch table, writes and reads a row,
then drops the table again.
"""
import os
import sys
import time
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def fail(message, *hints):
    print("\n  FAILED - " + message)
    for hint in hints:
        print("     - " + hint)
    sys.exit(1)


raw = os.environ.get("DATABASE_URL", "").strip()
if not raw:
    fail(
        "DATABASE_URL is not set.",
        "Supabase: Project Settings > Database > Connection string > URI",
        "Use the CONNECTION POOLER uri (port 6543), not the direct one (5432).",
        "Replace [YOUR-PASSWORD] with your real database password.",
    )

if "YOUR-PASSWORD" in raw:
    fail("The password placeholder is still in the URL.",
         "Swap [YOUR-PASSWORD] for the password you set when creating the project.")

from backend.database import DATABASE_URL, IS_SQLITE, engine  # noqa: E402
from sqlalchemy import inspect, text  # noqa: E402

parts = urlsplit(raw)
print("\n  Portfolio database preflight")
print("  " + "-" * 46)
print("  host   : " + (parts.hostname or "(none)"))
print("  port   : " + str(parts.port or "(default)"))
print("  driver : " + DATABASE_URL.split("://", 1)[0])

if IS_SQLITE:
    print("\n  This is a local SQLite file, not a hosted database.")
    print("  Set DATABASE_URL to your Postgres URL to test the one you are")
    print("  about to deploy against.\n")
    sys.exit(0)

if parts.port == 5432 and "pooler" not in (parts.hostname or ""):
    print("\n  NOTE: port 5432 is the DIRECT connection. A web app opens and")
    print("  closes connections constantly and will exhaust it. Prefer 6543.")

# ---- 1. can we connect at all? -------------------------------------------
started = time.time()
try:
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version()")).scalar()
except Exception as exc:
    detail = str(exc).lower()
    hints = []
    if "password authentication" in detail:
        hints.append("Wrong password. A '@' or '#' in it must be URL-encoded (@ becomes %40).")
    if "could not translate host name" in detail or "name or service" in detail:
        hints.append("Hostname is wrong or truncated - copy the URI again.")
    if "timeout" in detail or "timed out" in detail:
        hints.append("Nothing answered. Check the project is not paused in the dashboard.")
    if "ssl" in detail:
        hints.append("Try appending ?sslmode=require to the URL.")
    if "psycopg2" in detail:
        hints.append("Run: pip install -r requirements.txt")
    hints.append("Raw error: " + str(exc))
    fail("could not connect.", *hints)

print("\n  connected in " + str(int((time.time() - started) * 1000)) + "ms")
print("  server : " + str(version).split(",")[0])

# ---- 2. can we actually write? -------------------------------------------
# A read-only role connects happily and then fails on the first INSERT, which
# shows up as a broken site rather than as a bad credential.
try:
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS _portfolio_preflight (id INTEGER PRIMARY KEY, note TEXT)")
        conn.exec_driver_sql(
            "INSERT INTO _portfolio_preflight (id, note) VALUES (1, 'ok') "
            "ON CONFLICT (id) DO NOTHING")
        note = conn.execute(text("SELECT note FROM _portfolio_preflight WHERE id = 1")).scalar()
        conn.exec_driver_sql("DROP TABLE _portfolio_preflight")
    if note != "ok":
        fail("wrote a row but read something unexpected back.")
except Exception as exc:
    fail("connected, but cannot create tables.",
         "The app builds its own schema on first boot, so it needs CREATE.",
         "Use the postgres role from the connection string, not a read-only one.",
         "Raw error: " + str(exc))
print("  write  : create / insert / read / drop all OK")

# ---- 3. what is already there? -------------------------------------------
APP_TABLES = ("categories", "items", "settings", "chat_messages",
              "chat_names", "link_previews", "robot_state")
present = [t for t in sorted(inspect(engine).get_table_names()) if t in APP_TABLES]
if present:
    print("  schema : " + str(len(present)) + " of " + str(len(APP_TABLES)) +
          " app tables already present")
    if len(present) < len(APP_TABLES):
        print("           (the rest are created on the app's next boot)")
else:
    print("  schema : empty - the app will create everything on first boot")

# ---- 4. the mistake that actually gets people hacked ---------------------
admin = os.environ.get("ADMIN_KEY", "")
print()
if not admin or admin == "changeme123":
    print("  WARNING: ADMIN_KEY is unset or still the default.")
    print("  Anyone who opens /editor.html can rewrite your whole site with it.")
    print("  Set a long random value in your host's environment variables.")
else:
    print("  ADMIN_KEY is set (" + str(len(admin)) + " characters).")

print("\n  Preflight passed - this database is ready to deploy against.\n")
