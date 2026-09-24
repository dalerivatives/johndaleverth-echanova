# Deploying with Supabase

**Read this first: Supabase cannot run this app.**

Supabase gives you a Postgres database, file storage, auth and *Deno* edge
functions. It does not run Python, so there is nowhere on Supabase for a
FastAPI server to live. Anyone who tells you to "deploy your FastAPI app to
Supabase" is describing something that doesn't exist.

What Supabase *is* very good at here is being the part that has to survive:

| Piece | Where it goes |
|---|---|
| The FastAPI app | A host that runs Python — Render, Railway, Fly.io, Koyeb |
| The database | **Supabase Postgres** |
| Uploaded files (resume, images, videos) | **Supabase Postgres** too — stored in the database since v117 |

That split is worth having on its own. Free app hosts almost always have an
**ephemeral filesystem**: a local SQLite file is wiped on every redeploy and
every idle restart. Moving the database to Supabase is what stops your content
disappearing — and because uploads are kept in the database as well, it keeps
your uploaded files too.

---

## 1. Create the database

1. supabase.com → **New project**. Pick a region near your visitors and save
   the database password somewhere — it is shown once.
2. **Project Settings → Database → Connection string → URI**.
3. Copy the **Connection pooler** URI (port **6543**), not the direct one
   (5432). Pooled is what you want from a web app: app hosts open and close
   connections constantly, and a small Postgres runs out of direct slots long
   before it runs out of capacity.
4. Replace `[YOUR-PASSWORD]` in the string with the password from step 1.

It looks like this:

```
postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

Paste it exactly as given. The app normalises the scheme and names the driver
itself (`backend/database.py`), so `postgres://`, `postgresql://` and a
missing driver all work.

## 2. Deploy the app

Any Python host will do. On **Render**, which the included `render.yaml`
already describes:

1. New → **Web Service**, connect the repo (or upload this folder).
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the pooler URI from step 1 |
   | `ADMIN_KEY` | **a long random secret of your own** |

   Do not leave `ADMIN_KEY` unset. There is no default: without it the server
   invents a random key on every boot, so nobody — including you — can sign
   in to `/editor.html`, and it prints a warning until you set one. (The old
   published default `changeme123` is refused outright.)

   Leave `DEV` unset. It is for local editing only — it turns on live reload,
   which would have every visitor polling your server.

On first boot the app creates its own tables and seeds the default content.
You'll see it in the Supabase **Table Editor**: `categories`, `items`,
`settings`, `chat_messages`, `chat_names`, `link_previews`, `robot_state`,
`media_assets`.

## 3. Point the site at itself

Open `https://your-app.onrender.com/editor.html`, unlock with your `ADMIN_KEY`,
and set **Site settings → Sharing & search → Site URL** to your real URL.
If it is blank the server uses whatever address the visitor arrived on, which
is usually right, but setting it makes link previews, the sitemap and the
search-result data always name the same address.

## 4. Uploads

Since v117, files uploaded in the editor (item pictures and videos, the resume
PDF) are stored **in the database** (the `media_assets` table), so they survive
every redeploy and restart just like your text does. The `uploads/` folder on
the server is only a cache: after a restart the first request for a file writes
it back from the database, and later requests are served from disk.

One thing to keep an eye on: Supabase's free plan allows 500 MB of database in
total. Pictures and PDFs are small, but a single video can be 25 MB, so for
videos prefer pasting a YouTube link into the item's link box — the site plays
YouTube inside the page anyway.

Files uploaded with a version older than v117 were only ever on the server's
disk; if one has already been wiped, upload it again once.

## 5. Two things to know about how this app behaves in the cloud

**One worker.** A few things live in the server's memory rather than the
database: the live viewer count, the robot's tap-event buffer that drives the
real-time feed, and the rate limiters. With more than one worker process each
copy keeps its own, so two visitors on different workers wouldn't see each
other's taps live. Run a single worker (the default) unless you move that state
to Redis. The robot's HP, the chat and the leaderboard are all in the database,
so those are correct either way.

**The chat is open to the internet.** Anyone who finds the page can post, under
any unclaimed name. It is rate-limited, capped, and everything clears every 24
hours — but it is worth watching from the editor's **World chat** tab for the
first few days after you share the link.

---

## Troubleshooting

**`could not translate host name` / connection timeouts** — the password wasn't
substituted, or a special character in it needs URL-encoding (`@` → `%40`).

**`FATAL: too many connections`** — you're on the direct URI (5432). Switch to
the pooler (6543).

**`sslmode` errors** — append `?sslmode=require` to the URI.

**The site loads but the chat 500s after an upgrade** — a new column is
missing. `_add_missing_columns()` in `backend/main.py` adds them at startup on
both SQLite and Postgres; check the boot log for `migrated: added …` lines, or
for a `could not add` line explaining why one failed.

**Changes don't appear** — locally, that is almost always a leftover server on
port 8000 rather than caching. See the Phase 7 note in the project doc.
