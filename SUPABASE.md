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
| Uploaded files (resume, images) | **Supabase Storage**, or a disk on the host |

That split is worth having on its own. Free app hosts almost always have an
**ephemeral filesystem**: the SQLite file and everything uploaded is wiped on
every redeploy and every idle restart. Moving the database to Supabase is what
stops your content disappearing.

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

   Do not leave `ADMIN_KEY` unset. The default is `changeme123`, it is printed
   in this repo, and anyone who finds `/editor.html` can rewrite your site
   with it. The server prints a warning on every boot until you change it.

   Leave `DEV` unset. It is for local editing only — it turns on live reload,
   which would have every visitor polling your server.

On first boot the app creates its own tables and seeds the default content.
You'll see it in the Supabase **Table Editor**: `categories`, `items`,
`settings`, `chat_messages`, `chat_names`, `link_previews`, `robot_state`.

## 3. Point the site at itself

Open `https://your-app.onrender.com/editor.html`, unlock with your `ADMIN_KEY`,
and set **Site settings → Sharing & search → Site URL** to your real URL.
Until you do, link previews of your own site (the card someone sees when they
paste your link into Facebook or LinkedIn) still say `example.com`.

## 4. Uploads — the part people forget

The database is safe on Supabase now. **Uploaded files still are not**: they go
to `uploads/` on the app host's disk, which on a free tier is erased on every
redeploy. Your resume and any uploaded images vanish with it.

Two ways out:

- **Attach a persistent disk** to the service (Render offers this on paid
  plans) and mount it at `uploads/`. Nothing in the code changes.
- **Use Supabase Storage.** Create a public bucket, upload the file there, and
  paste its public URL into the editor instead of uploading through the form.
  Every media field in the editor takes a URL.

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
