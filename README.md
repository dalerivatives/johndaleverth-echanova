# v87 — smooth reload and portrait flash fix

An inline first-paint guard hides the whole portfolio during loading, including
portrait children with their own visibility rules. The opaque Trevelade screen
fades away once readiness completes. F5, Ctrl/Cmd+R and in-page retry fade into
the loading screen before reloading. Browser toolbar/hard reload cannot be
reliably delayed by JavaScript; it gets immediate coverage and the same startup
guard. Reduced-motion settings skip fades. Back/forward cache restores clear
the reload cover. All v86 design, voice and 3D fixes are retained.

Deploy using DEPLOY_v85.md; refresh to load v87 loader assets.

## Previous release notes

# v86 — restore moving backgrounds and the 3D robot

Fixed the v85 device optimization that stopped code/tree motion and selected
2D automatically. Phones and low-memory devices now keep moving decorations
and attempt the real WebGL robot. Lighter devices retain fewer decorations,
15 fps tree updates, 30 fps robot rendering, lower pixel density and no shadow
maps. Hidden/off-screen rendering still pauses. A 2D fallback is used only if
WebGL cannot initialize. The operating system reduced-motion setting continues
to suppress decorative animation. All other v85 changes are retained.

Deployment: follow DEPLOY_v85.md, then refresh the browser to load v86 assets.

## Previous release notes

# v85 — flat themes, mobile speech and lighter rendering

Start with **DEPLOY_v85.md**. Decorative gradients are removed, and the coded
portrait uses the active theme accent. Layout and existing content are retained.
Phone chat speech now uses lightweight server-generated male robot audio when
SPEECH_MODE=static; the bundled male recordings remain. A user tap is required
to enable audio. Repeated `code` commands no longer announce another transform.
Small/low-powered devices get fewer static decorations and the playable 2D robot.
See **UPDATE_v85.md** for verification and limitations.

## Historical release notes

# v84 — requested finishing changes

Removed only the circular gradient behind the portraits, retaining their
alignment, backdrop protection and contour highlight. A newly crowned robot
round winner is announced: "[Name] won this round by defeating the robot!"
The announcement uses the existing male voice engine and respects mute/voice
preferences. It does not replay an old win on page load or repeat the same round.
Dynamic voice availability has the same limitations as v83. Deployment steps
remain in DEPLOY_v83.md. See UPDATE_v84.md for this patch's verification.

# v83 update — profile layers and male voices

Start with **DEPLOY_v83.md** and **UPDATE_v83.md**. This release builds on the
uploaded v81 realtime-chat project. Both portraits share one responsive frame,
with a theme-aware halo and an opaque silhouette behind the code glyphs.
Typing `code` says **Code transform** using a bundled male recording.
Browser speech accepts only recognized male voices; an unavailable male voice
is explained beside the chat voice control. Render stays in static speech mode.
See **TEST_REPORT.md** for the checks performed and remaining deployment limits.

# v80 update

Start with **UPDATE_v80.md**. Uploaded branding is now a circular browser-tab
icon only. Viewer avatars remain in the header. This update also improves
startup, content retries, speech caching, and navigation accessibility while
keeping the v79 Render memory protection.

# v79 update

Start with **UPDATE_v79.md**. This release prevents the bundled neural voice
from exceeding low-memory Render limits while preserving the terminal and
whoami voices through pre-generated audio.

# v70 update

Start with **UPDATE_v70.md**. This release includes a new neural voice and its model parts.

# v69 update

See **UPDATE_v69.md** for anonymous visitor silhouettes and improved speech delivery.

# v68 update

See **UPDATE_v68.md** for the supplied-logo loading screen.

# v67 update

See **UPDATE_v67.md** for the latest voice-only welcome and circular avatars.

# v66 update

Start with **UPDATE_v66.md**, **KEEP_AWAKE.md** and **TEST_REPORT.md** for this release.

# Johndaleverth "Dale" Echanova — Portfolio

A full-stack version of the portfolio: a FastAPI + SQLite backend serves both
the public site and a password-protected editor, so Projects, Achievements,
and Tools can be managed from a UI instead of hand-edited HTML.

## Architecture

```
portfolio_app/
├── backend/            FastAPI app (API + serves the static site)
│   ├── main.py          routes, auth, file uploads
│   ├── models.py        SQLAlchemy models (Category, Item, Setting, ChatMessage,
│   │                                       LinkPreview, RobotState)
│   ├── linkpreview.py   fetches link thumbnails (read its SSRF notes)
│   ├── schemas.py       Pydantic response models
│   ├── seed.py          starting content, loaded once on first run
│   └── database.py      SQLite by default; Postgres via DATABASE_URL
├── static/              the public site + the editor (served as-is)
│   ├── index.html / style.css / script.js   the portfolio itself
│   ├── editor.html / editor.css / editor.js the content editor
│   └── assets/           the whoami portrait/silhouette images
├── uploads/              images/videos uploaded through the editor
├── requirements.txt
├── Procfile               for Render / other Python hosts
├── render.yaml             Render blueprint (optional one-click config)
├── start.bat / start.sh    local run scripts (Windows / macOS-Linux)
└── .env.example
```

One process serves everything: `/` is the portfolio, `/editor.html` is the
editor, `/api/*` is the JSON API, `/uploads/*` serves uploaded media. That
means **the site no longer works by just double-clicking `index.html`** —
Projects/Achievements/Tools now load their content from the backend, so the
server needs to be running.

### Data model

The public site and the editor work off these tables:

- **Category** — a heading, e.g. "Embedded Systems". Has a `section`
  (`project` / `achievement` / `tool`) and its own `sort_order`. This is the
  "storage box" each heading owns — its items live and reorder independently
  of every other heading.
- **Item** — one card inside a heading: `title`, `description`, `tools`
  (comma-separated tags), and optional media (`media_type` / `media_url` — an
  uploaded image/video file, or any pasted URL; see **Media and links on a
  card** below for how each kind is rendered).
- **Setting** — a key/value row for everything else on the site that you can
  edit: your name, tagline, terminal lines, social links, footer, SEO text,
  and the uploaded resume path. Key/value so a new editable field only needs
  a default in `seed.DEFAULT_SETTINGS` plus an input in the editor — no
  migration.
- **ChatMessage** — one post in the public World Chat (name, body, timestamp).
  Cleared automatically after 24 hours.
- **LinkPreview** — cached Open Graph data for a pasted link (thumbnail,
  title, description), so the target site is fetched once rather than once
  per visitor.
- **RobotState** — the World Chat robot's shared health, kill count and
  respawn timer. One row, owned by the server.

The Projects, Achievements, and Tools pages all render the same way: each
category becomes a heading with a horizontally **swipeable row** of its
items (native touch swipe, drag on desktop, and prev/next arrow buttons —
CSS scroll-snap under the hood, no extra library).

## Run it locally

**Windows** — double-click `start.bat`. It creates a virtual environment,
installs dependencies, and opens `http://127.0.0.1:8000` in your browser.

**macOS/Linux** — run `./start.sh` (same behavior).

**Manual, any OS:**
```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
set ADMIN_KEY=your-secret-key    # macOS/Linux: export ADMIN_KEY=your-secret-key
uvicorn backend.main:app --reload --port 8000
```
Then open `http://127.0.0.1:8000` for the site and
`http://127.0.0.1:8000/editor.html` for the editor.

The database (`portfolio.db`, a SQLite file) and the `uploads/` folder are
created automatically on first run, seeded with the current project /
achievement / tool content so the site isn't empty.

**When you get a new version of this project and want to see the
changes:** close the previous server first — press `Ctrl+C` in its
terminal window rather than just closing the window — before running
`start.bat`/`start.sh` again. `start.bat`/`start.sh` now auto-detect and
stop a leftover server on port 8000 if you forget, but if your browser
already had a tab open from the old run, do one manual refresh
(`Ctrl+Shift+R` / `Cmd+Shift+R`) after the new server starts to make sure
you're not looking at that tab's old cached page.

## Using the editor

Go to `/editor.html`, enter the admin key (see **Security** below), then:

- **Add a heading** — the text box at the top of each tab (Projects /
  Achievements / Tools). This creates a new swipeable row on the live site.
- **Add an item** — "+ Add item" inside a heading. Fill in a title,
  description, and comma-separated tools/tags, then either upload a file
  *or* paste a link — whichever you fill in is the one that's used.
- **Reorder** — **drag the grip handle** (⣿) on a card or a heading to move
  it, or use the arrow buttons. Both do the same thing; the arrows stay
  because dragging can't be done from a keyboard.
- **Site settings** — a tab holding everything that isn't a card: your name,
  tagline, terminal lines, social links, footer, resume upload, and your site
  address. See **Site settings** below.
- **World chat** — a tab for moderating what visitors have posted. See
  **World Chat** below.
- **Edit / delete** — the pencil icon on a card opens the same form
  pre-filled, with a delete button and a "remove current media" option.
- **Upload preview** — pick an image or video and you see it, plus its file
  size, *before* saving. Files over the 25 MB limit are flagged in the
  preview instead of failing after the upload.
- **Draft autosave** — anything typed into the item form is saved locally as
  you go and restored if you close the tab or hit Escape by accident. It's
  cleared the moment the item saves. Text only — a chosen file can't be
  remembered this way, so re-pick that.

Changes save immediately and appear on the public site on next load — no
rebuild or redeploy needed.

## World Chat

The Chat page is a real public chat, not a contact blurb. Any visitor picks a
display name and posts a message that everyone else sees. There are no
accounts — names are self-assigned and unverified, which is what a world chat
is. Their name is remembered in their own browser so they don't retype it.

Because it's open to anyone on the internet, the write endpoint is bounded:
messages are length-capped, each IP has a short cooldown between posts and an
hourly cap, and the backlog is trimmed to the most recent 500 messages so it
can't grow without limit.

**Messages clear themselves after 24 hours.** Nothing in the chat is
permanent — anything older than a day is dropped the next time the chat is
read or posted to, so the page never accumulates history and there's no
archive of visitors' names to look after.

**Moderating it:** the editor has a **World chat** tab listing everything
visitors have posted, newest first, with a delete button on each message and a
"Clear all messages" button. Worth checking now and then, since anyone can
post.

### The robot

The chat page has a shared robot everyone can tap. Its health is a
percentage and lives **on the server**, so every visitor is hitting the same
robot and sees the same number — one person can't knock it down in their own
browser. It reacts to each hit, gets shakier as its health drops, explodes at
0%, and rebuilds itself 10 seconds later. Taps are rate-limited per person so
a script can't destroy it instantly.

### Getting to the editor quickly

Besides typing `/editor.html`, there's a hidden shortcut on the site itself:
in the `PS C:\whoami>` terminal on the profile page, type **`edit portfolio`**
and press Enter. (`editor` and `edit` work too.) It isn't hinted anywhere on
the page — it's just there when you need it.

## Security

`/editor.html` is protected by a single shared admin key (the `ADMIN_KEY`
environment variable). This is intentionally simple — no user accounts —
because it's a one-person site.

The key is typed once, at the login screen, and exchanged via
`POST /api/auth/login` for a **signed session token that expires after 12
hours**. Only that token is stored (in `sessionStorage`, cleared when the tab
closes) and sent on subsequent requests, so the key itself never sits in
browser storage and doesn't travel with every write. The token is an HMAC
signed with the admin key, so it can't be forged or extended, and a stolen
one stops working on its own. The older `X-Admin-Key` header is still
accepted, so nothing breaks if you have an old editor copy open.

**`ADMIN_KEY` has no default — set it before you deploy.** If the variable
is missing (or is still the old `changeme123` placeholder), the server
generates a random key for that process and prints a warning. That means the
editor is locked and **nobody can sign in, including you**, until you set
the variable yourself. This is deliberate: `/editor.html` is a public URL,
so the key is the only thing guarding it, and a well-known default would
leave every deployment that skipped this step wide open.

On Render: **Dashboard -> your service -> Environment -> Add Environment
Variable -> `ADMIN_KEY` -> a long random secret -> Save.** Saving redeploys.
Anyone who has the key can add, edit, or delete your content, so treat it
like a password and don't commit it.

## GitHub contribution sync

The Activity panel pulls real public contribution data client-side — no
token needed — and falls back to a labeled sample heatmap if GitHub is
unreachable. The username comes from **Site settings → Social links →
GitHub username**.

## Site settings — everything else is editable too

The **Site settings** tab in the editor covers everything on the site that
isn't a Project/Achievement/Tool card. No file editing needed for any of it:

| Group | What you can change |
|---|---|
| Who you are | The small label, your name (split so the first part keeps the accent color), and your tagline |
| Terminal intro | The three lines inside the `PS C:\whoami>` window |
| Social links | An add-your-own list — see below |
| GitHub activity | The username behind the contribution heatmap |
| Resume | Upload your resume PDF |
| Sharing & search | Your site address, browser tab title, search/preview description, footer text |

### Social links — add as many as you want

Rather than a fixed set of five, this is a list you add rows to. Each row is:

- **Title** — what it's called, e.g. `GitHub`
- **Icon** — a [Font Awesome](https://fontawesome.com/search?ic=brands)
  class like `fa-brands fa-github`, **or** an image URL if the logo you want
  isn't in that icon set
- **Link** — the URL. A bare email address becomes a mail link automatically.

Rows can be reordered with the arrows, and that's the order they appear in on
the site — in the top bar and on the Chat page. Delete a row and that icon is
gone from the site; there's no way to end up with a link that goes nowhere.

**The resume button only exists once you've uploaded a resume.** Upload a PDF
in Site settings → Resume and a **Download resume** button appears on the
profile page. Remove it and the button disappears.

### Your site address (do this after deploying)

Set **Your site address** in Site settings → Sharing & search to your real
deployed URL (e.g. `https://trevelade.onrender.com`).

This is what makes **link previews** work. When your link is pasted into
Facebook, Messenger, LinkedIn, X, Discord or WhatsApp, those services fetch
your page and read its meta tags *without running any JavaScript* — so the
server fills the correct address, title and description into the HTML before
sending it. Until you set this, the tags still say `example.com` and the
preview image can't load, because preview images have to be absolute URLs.
Setting it also fixes `robots.txt` and `sitemap.xml` automatically.

## Media and links on a card

The **Paste a link** tab in the item form accepts any URL, and what shows up
on the card depends on what you pasted:

| You paste | The card shows |
|---|---|
| A YouTube or Vimeo link | An embedded player |
| A direct image link (`.png`, `.jpg`, `.webp`, …) | The picture itself |
| A direct video link (`.mp4`, `.webm`, …) | An inline video player |
| **Anything else** — a GitHub repo, a live demo, an article, a Drive file | **A preview card** with the destination site's own thumbnail, title and description — clicking it opens the site in a new tab |

So a project card can link straight to its repo or its live demo, and it
shows what that page looks like rather than a bare URL.

**How the preview is fetched:** your browser isn't allowed to read another
site's page (CORS), so the server fetches it, pulls out the Open Graph tags,
and caches the result for everyone — the target site is hit once a week, not
once per visitor. Sites that publish no preview tags simply show as a tidy
domain row instead.

**A note on that endpoint:** it's the one place where the server fetches a
URL someone typed in, which is exactly the shape of an SSRF vulnerability. It
only allows http/https, resolves every address and refuses anything private,
loopback, link-local or cloud-metadata, re-checks on every redirect hop, caps
the response size, and times out. See `backend/linkpreview.py` — the
reasoning is written out there so it doesn't get relaxed by accident later.

## Accessibility & polish

- **Reduced motion** — if the visitor's OS is set to minimise animation, the
  drifting code, floating silhouette, crossfades and smooth carousel
  scrolling all switch off. This is an accessibility need, not a taste
  setting: that kind of movement can trigger motion sickness.
- **Keyboard** — a "Skip to content" link appears on first Tab; the card
  carousels can be paged with ← → / Home / End once focused; every control
  has a visible focus ring.
- **Screen readers** — carousels announce themselves and their item counts,
  arrows and dots say which item they go to, and decorative icons are hidden
  from the reading order.
- **First-visit theme** — with no saved preference, the site follows the
  visitor's system light/dark setting instead of always starting dark. Once
  they pick a theme from the palette menu, that choice wins from then on.
- **Live viewer count** — the top bar shows how many people actually have
  the site open right now (each tab heartbeats every 20s; a viewer counts as
  online for 45s after their last heartbeat). It hides itself rather than
  showing a made-up number if the backend can't be reached. The count lives
  in memory on the server, so it resets when the server restarts — that's
  deliberate for a "right now" number.
- **404 page** — a mistyped URL gets a styled page matching the site, not a
  bare "Not Found".

## Deploying to Render (free tier)

1. Push this project to a GitHub repo.
2. In Render: **New → Web Service**, connect the repo (Render will detect
   `render.yaml` if you keep it, or you can configure manually):
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
3. Add an environment variable **`ADMIN_KEY`** set to a real secret — don't
   skip this step.
4. Deploy. Your site is at `https://<your-service>.onrender.com`, the editor
   at `https://<your-service>.onrender.com/editor.html`.

**Important SQLite caveat:** Render's free web service disk is *ephemeral* —
anything written to it (including the default `portfolio.db` SQLite file and
uploaded media) is wiped on every redeploy or restart. That's fine for
trying things out, but for content that must survive redeploys, do one of:

- **Use Postgres instead** (recommended): create a free Render Postgres
  database — or a **Supabase** one, see `SUPABASE.md` for the walkthrough —
  copy the connection string, and set it as the `DATABASE_URL` environment
  variable on the web service. Nothing else changes: the app normalises the
  URL scheme, names the driver, and adds any missing columns at startup on
  either dialect.

  *Supabase itself cannot host the app* — it runs Postgres, storage and Deno
  functions, not Python. It is the database half; the FastAPI half still needs
  a Python host. `SUPABASE.md` covers that split.
- **Attach a Render persistent disk** (paid) and point `DATABASE_URL` at a
  SQLite file on that disk, e.g. `sqlite:////var/data/portfolio.db`.

Uploaded media (`uploads/`) has the same ephemeral-disk issue — on Render's
free tier, prefer pasting a video/image *URL* in the editor (e.g. a YouTube
link, or an image hosted on GitHub/Imgur/Cloudinary) over uploading a file
directly, unless you've set up persistent storage.

## Customize

- `backend/seed.py` — the starting content (only used the very first time
  the database is empty; edit through `/editor.html` after that).
- `static/script.js` — navigation, GitHub sync, whoami reveal, and the CMS
  rendering (carousel/swipe logic) for Projects/Achievements/Tools.
- `static/style.css` — all styling, themes, and responsive breakpoints.
- `static/editor.js` / `static/editor.css` — the editor UI.

## Older notes (still true)

**Exclusive crossover fade** — the `whoami` terminal easter egg does a
smooth simultaneous crossfade between the coded-human silhouette and the
real portrait, but the end states are exclusive: after `whoami`, the coded
layer reaches opacity 0 and stays hidden; after `code`/`ascii`, the real
photo does. Both may cross-fade only during the ~700ms transition itself.
No human asset, positioning, theme, terminal, or command behavior changed
from the original `CROSSOVER_FADE_REVEAL` version — the hero's
`--human-shift-y` was tuned (and given per-breakpoint overrides) so the top
of the head/shoulders clears the fixed header bar instead of being hidden
behind it.
