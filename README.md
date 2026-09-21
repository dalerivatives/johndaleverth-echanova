# Portfolio v89 — compact deployment

Same public site, editor, 3D robot, themes, reload transitions and upload fixes
as v88. This package removes the unused optional neural model, historical notes,
reference artwork and development tests from the deployment download. All
runtime frontend code and used assets are retained unchanged.

## Deploy on Render

- Retain your existing ADMIN_KEY, DATABASE_URL and uploaded content.
- Use Python 3.12.14 and SPEECH_MODE=static (also set in render.yaml).
- Build: `pip install -r requirements.txt`
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`. Use one worker for realtime presence/chat.
- Local launchers: start.bat or start.sh; both now use lightweight speech.
- Keep a persistent database for stored icons/content. Keep durable uploaded
  media storage; ephemeral Render storage can reset on redeploy/restart.
- See SUPABASE.md for database setup, KEEP_AWAKE.md for existing heartbeat setup.

Male speech remains: the three original recordings plus lightweight generated
male robot chat speech. Optional neural synthesis needs separately restored
model files and dependencies; see voices/README.md. Do not use dynamic mode
with the compact package until those files are restored.

When replacing a repository, delete the excluded files listed in CLEANUP.txt
as well: copying new files over old ones does not remove old model parts. Keep
live uploads and your database; they are not supplied or removed by this ZIP.
