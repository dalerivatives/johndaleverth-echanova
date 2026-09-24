# Trevelade — portfolio (v117)

A personal portfolio with its own backend: a single-page site (Profile,
Projects, Achievements, Tools, World Chat with a shared 3D robot), a
password-protected editor at `/editor.html`, a GitHub activity heatmap, and a
male robot voice. Everything on the site is edited from the editor and stored
in the database — no code changes needed for content.

See **WHATS_NEW.md** for what changed in this version.

## Deploy on Render

| Setting | Value |
|---|---|
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| Python | 3.12.14 (set in `render.yaml` and `.python-version`) |
| Health check | `/api/health` |
| Workers | **one** (the live viewer count, robot feed and rate limits live in memory) |

Environment variables:

- `ADMIN_KEY` — **required**, a long random secret; it unlocks the editor.
- `DATABASE_URL` — your Supabase **pooler** URI (port 6543). Content, the tab
  icon and uploaded files all live here. See `SUPABASE.md`.
- Optional: `GITHUB_TOKEN`, `KEEPALIVE_*` — see `.env.example`.

Keeping the free instance awake is covered in `KEEP_AWAKE.md` (the app pings
itself on Render, and `.github/workflows/keep-awake.yml` can wake it).

## Run it on your computer

- Windows: double-click `start.bat`
- macOS / Linux: `./start.sh`

Both create a virtual environment, install requirements, print a local editor
key, and open `http://127.0.0.1:8000`. Edits to HTML, CSS and JS reload the
browser automatically while it runs.

Before pointing a deployment at a new database, `check_db.py` tests the
connection and permissions (instructions at the top of the file).

## Layout

```
backend/        FastAPI app (main.py) and its helpers
  models.py       database tables     seed.py      first-run content + settings
  github.py       heatmap data        linkpreview.py  safe link previews
  keepalive.py    self-ping on Render speech_lite.py   robot voice (eSpeak NG)
  iconify.py      round tab icon      icon_data.py  built-in fallback icon
static/         the site: index.html, editor.html, script.js, style.css, …
  assets/         images and the three pre-recorded voice clips
  vendor/         Font Awesome and three.js (with their licences)
uploads/        disk cache for uploaded files (the database holds the originals)
```
