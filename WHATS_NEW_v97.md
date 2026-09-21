# Portfolio v97 — what changed

## 1. The robot is now the Travelade EXPLORER-BOT T-700V

`static/robot3d.js` was rebuilt to the multiview concept sheet. Nothing of
the old white-and-pink toy robot is left:

- **Screen head.** The head *is* the display — a wide dark panel in a
  white bezel, carrying the Travelade mark and wordmark, a charge-cell
  block, the unit tag, and a status strip along the bottom with the live
  clock. It is a canvas texture, repainted twice a second.
- **Sensor bar** across the top of the bezel: main camera lens, secondary
  sensor, and a green status LED that goes blinking red when the unit is
  in trouble.
- **Illuminated eye-array** — four lamps in a dark recess under the
  screen. With no eyeballs to move, the glance is carried by brightness:
  the whole array dips together for a blink, and the lamps on the side it
  is looking toward burn brighter than the ones behind the turn.
- **White torso** in Travelade blue trim: shoulder yoke, flank stripes,
  chest decal, a storage compartment with a recessed handle, and on the
  back a battery pack with charge pips, a charging port, louvred vents and
  a stencilled **T-700V / EXPLORER-BOT** ident plate.
- **Articulated arms** with blue cuffs ending in real hands — four jointed
  fingers and a thumb, not claws.
- **Four lugged all-terrain wheels** on a splayed chassis with the single
  orange bumper stripe.
- Blue **T roundels** on both sides of the head.

Two details worth knowing, because they are the difference between this
reading as the sheet and reading as a box on castors:

*The wheels are splayed.* Seen dead-on, a wheel shows only its tread — a
tall dark band that reads as a caterpillar track. The concept sheet avoids
this by angling the axles outward so the hub face turns toward the viewer.
The toe angle sits on the mount, outside the group that carries the
rolling rotation, so the wheel still spins about its own axle.

*The logo is drawn, not loaded.* The mark, the wordmark and the ident
plate are all painted onto canvases in this file. The robot is meant to
work with no network and no assets beyond three.js, and a logo that 404s
on the screen that is the robot's face is a worse failure than a slightly
simpler mark.

The public API is unchanged (`mount / pick / hit / explode / revive /
setHealth / setScreen / resize / dispose`), so nothing else needed
rewiring. The site's copy now says **T-700V** wherever it used to say
UNIT-01.

The camera **auto-frames**: the distance is solved from the field of view
against the robot's real height, so the whole unit fits whatever shape the
stage is instead of getting cropped on a short one.

## 2. It watches your cursor

The head and eyes follow the pointer anywhere on the page — not just
inside the robot's own box — with the body turning a little later and a
lot less, so the neck has weight. The eyes also drift inside the visor, a
couple of millimetres, which is the difference between the robot looking
*at* you and merely facing you.

After ~4 seconds without the pointer moving it stops staring and starts
glancing around on its own, so it never looks frozen.

The pointer handler caches the stage's bounding box (refreshed four times
a second, and immediately on scroll or resize) rather than forcing a
layout flush on every mouse move across the page.

## 3. Sound

**New voices in `static/sfx.js`:**

| Voice      | What it is |
|------------|------------|
| `servo()`  | A geared motor turning and stopping. The stop matters more than the run — the gearbox taking up its backlash is what makes it a servo and not a hum. Fires when the robot makes a big head turn, and on every hit. |
| `tread()`  | Rubber turning over grit. Low, short, no pitch of its own. Fires when the treads scrabble after a hit. |
| `ping()`   | An antenna tip blinking — one inharmonic blip with a breath of air under it. |
| `bootup()` | Power rail winding up, then three rising tones. Plays when the robot mounts and again on every revive, so a rebuild is something you hear finish. |

All of them are below the level of a click, because they fire from an
animation loop rather than from a press — nobody asked for them.

**Typing now works everywhere**, not just in the terminal
(`static/uisound.js`). It is delegated at the document, so fields built at
runtime — the chat composer, the editor, anything added later — are
covered without being wired up one at a time. Held keys and pastes are
silent. Space and Enter get their own lower voices. Any field can opt out
with `data-no-sound`, and password fields opt out on their own.

## 4. The Google search favicon — fixed

**The cause.** The site had no crawlable icon at all. The tab icon was
built entirely in the browser: `favicon.js` fetched `/api/settings`, drew
your photo into a canvas with a circular mask, and set the `<link>` href
to the resulting `data:` URL. That is why the tab showed your photo and
Google showed a grey globe — three separate reasons, any one of them
fatal:

1. Google's favicon fetcher does not run the page's JavaScript, so the
   only icon it ever saw was the **empty 64×64 SVG** sitting in the head.
2. A `data:` URL is not a fetchable location. Google indexes favicons by
   URL; there was nothing to crawl.
3. The one real icon URL that did exist, `/api/favicon/<hash>`, sits under
   `/api/` — **which `robots.txt` disallows.** Even a correct `<link>`
   pointing at it would have been refused.

**The fix.**

- Real icon files generated from your profile photo, cropped to the face
  so it is still readable at 16px, circular-masked to match the tab:
  `favicon.ico` (16/32/48/64), `icon-96.png`, `icon-192.png`,
  `icon-512.png`, `apple-touch-icon.png`.
- Root-level routes in `backend/main.py` serve them — and serve the icon
  **uploaded in the editor** instead, when one is set, so your upload
  still wins. The bundled files are the fallback, which means a fresh
  deployment with an empty database still has a crawlable icon on day one.
- Real `<link rel="icon">` tags in the head of `index.html`, plus
  `apple-touch-icon` and a `/site.webmanifest` for home-screen installs.
- `robots.txt` explicitly allows all of them.
- `favicon.js` no longer blanks the icon while it works. The static file
  stays up until the circular version is genuinely ready, so a slow
  connection or a failed `/api/settings` call leaves a good icon showing
  instead of nothing. It blanks first only when you change the icon in
  the editor, where showing the old one would be wrong.

### v92 follow-up: /favicon.ico was 404ing in production

After the v91 deploy, `/site.webmanifest`, `/icon-192.png` and the new
`robots.txt` were all live — but `/favicon.ico` itself returned **404**.
One file had not survived the deploy, and the route depended on it, so
Google still had nothing to fetch and kept the grey globe.

Two changes so that cannot happen again:

- **`/favicon.ico` now falls back through a chain of candidate files**
  (`favicon.ico` → `icon-192.png` → `icon-96.png` → `icon-512.png`) and
  serves the first one present. Serving a PNG at `/favicon.ico` is
  perfectly valid — browsers and crawlers go by Content-Type, not by the
  extension in the URL. Every icon path has its own chain, so any single
  missing file is now invisible to the outside world.
- **The uploaded icon is found whichever way it was stored.** The site has
  had two storage shapes: newer uploads live in the database and are
  addressed as `/api/favicon/<hash>`; older ones were written to the
  uploads directory as `/uploads/<name>`. Only the first was being read,
  so a site whose icon had been uploaded the old way fell straight past it
  to the bundled file. Both are read now, with the uploads path reduced to
  its bare filename first so it cannot be walked out of that directory.

### v93: the real reason it survived two fixes — a cached 404

`/favicon.ico` was still 404 on the live site after v92, while
`/favicon.ico?cachebust=991` — same server, same route, same second —
returned the image.

That difference can only come from something in front of the origin. There
is a CDN there (the code has always assumed one; see the asset-fingerprint
note in `backend/main.py`), and `/favicon.ico` is one of the paths a CDN
caches hardest — **including the 404**. So the whole sequence was:

1. One deploy went out without `static/favicon.ico`.
2. The route 404'd once.
3. The edge stored that 404 against the bare URL.
4. Every deploy after that was irrelevant, because nothing — not Google,
   not a browser — reached the origin again. The origin was fixed and the
   search result still showed a grey globe.

Adding a query string bypassed the cached entry and hit the origin, which
is how it showed up.

**The code change:** a missing icon is now returned with
`Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, so a miss
can never become sticky like that again — the edge is obliged to ask the
origin every time until the origin has something to give it. A found icon
caches for an hour rather than a day, so re-uploading one in the editor
shows up the same session.

**The change only you can make:** purge the CDN cache for that URL. Code
cannot evict an entry the edge is already holding. In Cloudflare:
Caching → Configuration → Purge Cache → either purge the single URL
`https://johndaleverthechanova.com/favicon.ico` or Purge Everything.

Verified locally in all three states: every icon file missing (404, and
uncacheable), only `favicon.ico` missing (200, served as PNG — which is
exactly production's state), and everything present (200, `image/x-icon`).

### v94: routing around the cached 404 instead of fighting it

The purge did not clear it. Measured again, with a brand-new probe value so
nothing between here and the server could have seen it before:

| URL | Result |
|---|---|
| `/favicon.ico` | **404** |
| `/favicon.ico?probe=772311` | **200, an image** |

Route matching ignores query strings — the server runs identical code for
both — so the origin is serving the icon correctly and something in front
of it is still answering for the bare URL. A cached response cannot be
revoked from the origin. It can only be purged at the edge.

So the page stopped asking for that URL.

**`/brand-icon.png`** (plus `-512` and `-touch`) are new paths that have
never been requested by anything, anywhere. No cache holds a stale answer
for them, so the first request for one lands on the origin. The head now
declares those first, and `/favicon.ico` last — still served, still
correct, for clients that probe it by convention, but no longer the URL
this site depends on.

They are permanent paths, not cache-busting query strings. A favicon URL
that changes every deploy makes a search engine re-crawl it every time, and
Google asks for a stable one.

`robots.txt` and `site.webmanifest` point at the new paths too. Verified
locally: all four icon URLs 200 with the right content types, the served
HTML carries the new links, and the page still loads with no console
errors.

### v95: the icon is now IN the code, and rebuilt from the new portrait

**`/brand-icon.png` went live and works.** The new path did exactly what it
was for — it walked straight past the cached 404, because no cache had ever
been asked for it. The server side is fixed and reachable.

Two additions on top.

**The icon is embedded in the source tree.** `backend/icon_data.py` holds a
192x192 PNG as base64 text. It is the last link in the chain: the icon
uploaded in the editor wins, then the files in `static/`, then this. The
point is that every layer above it can fail by a file not arriving — which
is precisely what happened, once, and cost weeks of a grey placeholder. This
one cannot: if that module were missing, the app would not import, so the
site would be down rather than iconless. **The icon route no longer has a
state where it returns nothing.**

Verified by deleting all five icon files and restarting: every icon URL
still returned 200 with the embedded PNG. With the files back, the real
files win again.

Worth being precise about what this does and does not fix. It hardens
against a *missing file*. It would not have rescued `/favicon.ico` from the
*cached 404* — nothing at the server could have, because nothing was
reaching the server. Those were two different bugs, and `/brand-icon.png`
is what solved the second one.

**The icon set was rebuilt from the newer portrait.** Cropped to the face,
because a full portrait at 16px is an unreadable smudge, and ringed in the
site's navy — the studio backdrop is mid-grey and vanishes against Google's
white results page, so the ring is what gives the icon a defined edge on any
background. Composited at 2048px and downscaled once, since masking at the
target size leaves visibly stepped edges at small sizes. Checked at 48, 32
and 16px on both a light and a dark results page.

`tools_make_icons.py` regenerates the whole set plus the embedded module, so
changing the photo later is one command rather than a manual rebuild.

### v96: the tab is never blank, and uploads are round everywhere

**The blank tab while loading — found and fixed.**

`favicon.js` had a function that created the tab's `<link rel="icon">` and
it ran at the top of `apply()`, on every page load, before there was
anything to put in it. So an element like this was appended to the END of
the head on every visit:

```html
<link rel="icon" id="tabIcon">
```

No `href`. A browser that takes the last declared icon then had an empty one
to honour, and the tab went blank. Worse, if no custom icon had ever been
uploaded, `apply()` returns early in that case — so the hrefless link just
stayed there, and the tab stayed blank permanently.

The link is now created only when there is a real image to put in it. The
page already ships real circular PNGs in its head; those show from the
moment the HTML is parsed and keep showing the whole time the script is
working. Nothing is removed until a replacement is live.

A related sequence is fixed too: upload an icon in the editor (the static
links get retired in favour of the generated one), then press **Remove
logo**. The generated link goes away with the icon it was showing, and the
static links had been thrown away for good — leaving the document with no
icon at all until a reload. They are kept now and put back.

Measured in a real browser, sampling the icon links every 40ms from first
paint for seven seconds, in three states — no custom icon, custom icon, and
upload-then-remove. The only sample without an icon is at ~20ms, before the
browser has parsed the head at all, which no site can do anything about.

**Uploading a photo: still there, and now round everywhere.**

The Upload photo button never went anywhere — it is in the editor under the
site logo, next to Remove logo. What was wrong is subtler: the circular crop
happened *only* in `favicon.js*, in the browser. So an upload produced a
round icon in the tab and a **square** one everywhere else — search
crawlers, phone home screens, link unfurlers — because none of them run the
page's JavaScript. One upload, two different icons.

The crop now happens on the server, once, at upload time
(`backend/iconify.py`). Verified end to end: a raw square JPEG posted to the
upload endpoint comes back out of every icon URL as a 512x512 circular PNG
with transparent corners. Pillow is imported defensively — if it were
missing, the original bytes are stored exactly as before, because an
un-cropped icon is a much smaller problem than an upload endpoint that
raises.

**Why your upload probably disappeared.** On Render's free plan the disk is
ephemeral, and the default database is a SQLite file on that disk — so every
redeploy wipes it, including the uploaded icon. That is not a bug in the
upload feature; it is the plan. `SUPABASE.md` covers pointing `DATABASE_URL`
at a real Postgres database, which is what makes it stick. The editor now
says this in place of the old bare "please upload the photo again", and the
bundled circular icon means the site never looks broken in the meantime.

### v97: no square phase, no empty phase — one icon, from first paint

The three-stage flicker on refresh (square, then nothing, then the circle)
had one cause behind both halves of it, and it was not in the browser.

**The square was real, and it was coming from the server.** Cropping was
added at UPLOAD time, which fixes every future upload and nothing already
saved — and the icon a live site is serving is, by definition, one that was
saved earlier. The page's `<link>` pointed at the icon route, the route
handed back the original square photo untouched, and only then did the
browser-side canvas redraw it as a circle. So: square first, circle second,
with a gap in between while the swap happened.

Two changes, and the whole sequence disappears.

**The server now rounds on the way OUT as well as the way in.** An icon
uploaded before any of this existed is served as a circle, with nothing to
re-upload. Masking costs tens of milliseconds so the result is cached by
content hash; the icon changes about once a year, so it is computed about
once a year.

**`favicon.js` no longer draws the tab icon at all.** It used to fetch the
picture, paint it into a canvas with a circular mask, and hand the result to
a `<link>` it created — which is exactly the swap that produced the empty
moment. There is nothing left for it to fix: every URL the page points at
already returns a circle. What it still does is small and worth keeping —
when the icon is *changed* in the editor the URL has not changed, so a
browser sitting on a cached copy would keep showing the old one; it bumps a
version parameter to force a refetch, and tells other open tabs to do the
same.

Measured in a browser, sampling the icon links every 30ms from first paint,
with a **raw square JPEG planted in the database** so the test ran against
the live site's exact state:

```
distinct icon-link states during load: 2
  t=   40ms  []                                     <- before the head is parsed
  t=   71ms  ["/brand-icon.png", ...]               <- and it never changes again
```

Two states, where there used to be four. The first is the instant before the
browser has parsed any HTML, which no site can do anything about. From 71ms
the tab has the final, circular icon and nothing touches it again.

The editor's preview was repointed too: it previewed the raw stored file, so
it showed the owner a square that no visitor ever saw. It now previews what
the site actually serves.

### What you still have to do yourself

Google caches favicons and re-crawls them on its own schedule — the fix
is live the moment you deploy, but the search result will not update
until Google comes back. To hurry it along:

1. Deploy.
2. Open `https://johndaleverthechanova.com/favicon.ico` in a browser and
   confirm you see your face, not a 404.
3. In **Google Search Console** → URL Inspection → enter your homepage →
   **Request Indexing**.
4. Give it a few days to a couple of weeks. There is no way to force it
   faster; anyone who says otherwise is guessing.

One thing worth knowing: Google wants a **square** icon of at least
48×48. The bundled files are square. If you later upload a new icon in
the editor, upload a square image — a wide photo gets letterboxed or
rejected.
