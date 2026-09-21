# Portfolio v108 — what changed

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

### v98: 635KB smaller, with nothing removed that the site uses

I audited for dead code first and found none worth reporting — no
unreferenced top-level functions in any of the eleven JavaScript files, and
every asset in `static/assets/` is referenced by the HTML, CSS or JS. The
FontAwesome bundle looked like a candidate until the count came back: solid
89 uses, brands 6, regular 3. All three font files are earning their place.

So the savings are compression, and each one is either lossless or drops
data the site provably never reads:

| File | Before | After | |
|---|---|---|---|
| `profile-transparent.png` | 832KB | 426KB | re-encoded, **pixels verified identical** |
| `og-preview.png` → `.jpg` | 269KB | 87KB | a photograph in the wrong container |
| `human-coded-exact-contour.png` | 102KB | 66KB | colour channels dropped |
| `icon-512.png` + the other icons | 281KB | 271KB | re-encoded losslessly |
| **Total** | **1485KB** | **850KB** | **635KB saved** |

The contour PNG is the one worth explaining. `profile.css` uses it through
`mask:url()`, and a CSS mask takes its shape from the image's **alpha**
channel — the RGB underneath has never been rendered by anything. Storing
it as an LA image keeps the alpha to the last pixel and throws away two
channels nobody reads. The script asserts the alpha is byte-identical
afterwards, and so does the portrait's full pixel data.

`og-preview.png` became a JPEG because a 1200x630 photograph is the one
thing PNG is bad at. Every platform that renders a preview card accepts
JPEG. All three references were updated.

`backend/icon_data.py` was re-derived from the re-encoded `icon-192.png`, so
the embedded copy still matches the file byte for byte — there is an
assertion for that too.

Only one file was deleted: `CLEANUP.txt`, a stale note listing what a
previous version's packaging had excluded. `check_db.py` is unreferenced by
the app but kept deliberately — it is a database inspection tool, and
database state is the thing that keeps biting this deployment.

### And a real bug found on the way

While testing the optimised build against a fresh database, `/api/robot`
returned a 500: `UNIQUE constraint failed: robot_state.id`.

`_get_robot()` checked for the row and created it if absent, which is a race
— the page opens several connections at once, so on a database that has
never seen a request, two of them both find no row and both try to create
it. One wins; the other 500s.

That sounds rare until you remember this deploys to a host with an ephemeral
disk, where **every single redeploy produces exactly that state**. The loser
now simply reads the row the winner just committed. Verified with twelve
concurrent requests against a brand-new database: twelve 200s, zero
tracebacks. It used to fail on the first page load after every deploy.

### v99: round while loading, square once settled — the `sizes="any"` trap

The icon flipped the other way round this time: correct during load, square
once the page had settled. That is a different bug from the last one and it
was one attribute.

```html
<link rel="icon" href="/favicon.ico" sizes="any">
```

`sizes="any"` declares an icon as **scalable**. It exists for SVG, and a
browser ranks a scalable icon above every fixed-size one. So the sequence
was: paint the first icon the parser reaches (the 192px PNG — round), then
finish evaluating all four and settle on the one that claims to be scalable
— `/favicon.ico`.

Which is the worst possible URL to settle on here. It is the single path
that spent weeks 404ing, then served the raw square upload untouched through
v94–v96. Both a CDN and Chrome's own favicon database — which is separate
from the HTTP cache and far stickier — had a square stored against it.

Confirmed rather than assumed: instrumenting a real browser shows it
requests **only the ICO** and ignores the PNGs entirely. The ICO is what the
tab shows, so the ICO was the file that mattered all along.

Two changes:

- **`sizes="any"` is gone**, and every icon link now carries an explicit
  `type` and explicit `sizes`. Nothing claims to be scalable, so nothing
  outranks anything else on a false premise.
- **The ICO moved to `/brand-icon.ico`** — the same reasoning that moved the
  PNGs earlier. Nothing has ever requested that path, so no cache anywhere
  holds a square against it. `/favicon.ico` is still served for crawlers
  that probe it by convention; the page just does not point at it any more.

Verified: all five icon URLs return images whose corner pixels are
transparent and whose centre is opaque — round, not square — and the icon
links no longer change after the page settles.

**One thing worth knowing:** Chrome caches favicons in its own database,
which a hard refresh does not clear. If the old square lingers for you after
deploying, open the site in an Incognito window to see the truth. The URL
change should sidestep it entirely, but that is how to tell a stale cache
from a real problem.

### v100: the name, and the blank moment on refresh

**"P." is now "Pastorfide".** The title reads **Engr. Johndaleverth
Pastorfide Echanova** in the browser tab, the search result, the link
preview and the home-screen label.

One thing to know about where that text lives: the title on your live site
comes from the **database**, set through the editor — not from the code. So
changing the code changes what a *fresh* database gets, and your existing
row keeps whatever it already holds. On a host with an ephemeral disk that
resolves itself on the next deploy, but the reliable move is to open the
editor and set the site title there too. I have updated every place the code
decides it: the seeded default, the `<title>` in the HTML, the og and
twitter titles, and the manifest fallback.

**The blank flash when you refresh.**

The icon was being served with a one-hour cache and no `immutable`. Without
`immutable` a browser revalidates the icon on reload even when the copy it
already holds is perfectly fresh — and that round trip to the server is the
blank moment. The tab has nothing to draw until the response comes back.

Icons are now served **content-addressed**: the page's icon links carry
`?v=<hash of the icon itself>`, and a request with that parameter gets
`max-age=31536000, immutable`. The browser paints the icon from disk before
it touches the network.

The version is a hash of the picture, deliberately, not a deploy stamp. A
deploy-stamped URL would send every crawler chasing a "new" icon on every
deploy for no reason; a content hash changes only when the picture actually
changes — verified by uploading a different image and watching it go from
`a28e0b05d927` to `5bf6d04add8d`.

Unstamped requests — a crawler probing `/favicon.ico` by convention — still
get the modest one-hour cache, because those URLs are not content-addressed
and must not be pinned for a year.

Measured by counting what the **server** received across three page loads
(one fresh, two refreshes):

```
GET /brand-icon.ico?v=5bf6d04add8d   1
GET /brand-icon.png?v=5bf6d04add8d   1
```

Once each. The two refreshes never reached the server at all — the icon came
from disk, which is why there is no gap to see.

### v101: the name actually changes, and the tab icon needs no fetch at all

Both of these were half-fixes last time. Here is what was wrong with each.

**The name.** I changed the defaults in the code and told you to also change
it in the editor. That was the wrong shape of answer: the title on your live
site lives in the **database**, so the code change only ever affected a
fresh install and your site kept saying "P." regardless.

There is now a migration that runs at startup and rewrites the stored value.
It is deliberately narrow — it touches only `site_title`, only when the value
still carries the abbreviated initial between those two exact names, and it
writes your own name rather than anything invented. It also repairs the
missing space in `Engr.Johndaleverth`. Once it has run the pattern no longer
matches, so it is a no-op afterwards and cannot fight an edit you make in
the editor later.

Verified against the exact value your site holds:

```
'Engr.Johndaleverth P. Echanova'  ->  'Engr. Johndaleverth Pastorfide Echanova'
'Engr. Johndaleverth Pastorfide Echanova'  ->  unchanged
'Dale — Dynamic Stack Portfolio'           ->  unchanged
```

The home-screen label is now just **Johndaleverth** — honorific stripped,
because that label sits in a very small box under an icon and
"Engr. Johndaleverth" gets truncated by the device.

**The blank at the start of a refresh.** Last time I made the icon cache
`immutable`, which removed the network round trip — and that was the wrong
target. The gap is not how long the fetch takes. It is that a fetch has to
happen *at all*: when a browser navigates it tears the old page down and the
tab icon goes with it, and the new one cannot appear until the document has
been parsed far enough to find a `<link>`, the URL resolved, and the bytes
returned. Even a disk-cache hit is not instantaneous. No `Cache-Control`
value can close that, which is why the last fix did not.

The icon is now **written into the HTML** as a 32x32 `data:` URI, spliced in
by the backend above the other icon links. There is no URL to resolve and
nothing to fetch — it exists the moment the parser reaches the tag, a few
hundred bytes into the document. 32x32 covers a tab at 2x device pixel ratio
and costs about 3.4KB per page.

The crawlable URLs stay in the head at 192 and 512. The two do not compete:
a tab asks for 16-32px and takes the exact-size inline copy; a crawler wants
a large icon and ignores a `data:` URI it cannot fetch. The ICO was removed
from the head for the same reason — it advertised 16/32/48, which would have
given the browser a competing exact match that it would have to *fetch*.
Both `/favicon.ico` and `/brand-icon.ico` are still served for crawlers that
probe them by convention.

Measured across one fresh load and three refreshes:

```
network requests for a tab icon:
   first   : NONE
   reload1 : NONE
   reload2 : NONE
   reload3 : NONE
```

Not "fast". **None.** All four crawlable icon URLs still return round images.

### v102: why "nothing happened" — you were reading a cached page

I should have checked this several versions ago instead of shipping more
code. Fetched in the same second, just now:

| URL | `<title>` |
|---|---|
| `https://johndaleverthechanova.com/` | `Engr.Johndaleverth P. Echanova` |
| `https://johndaleverthechanova.com/?cachebust=55912` | `Engr. Johndaleverth Pastorfide Echanova` |

Same server. Same database. The only difference is a query string — so the
old page is not being *produced* by your site, it is being *replayed* by a
cache in front of it.

**Your deploys have been working.** The name migration ran; the origin is
serving the corrected title right now. Every fix since then is live there
too. None of it reached your browser, because the bare URL kept returning a
copy of the page from weeks ago. That is the whole reason each round of
this looked like it did nothing.

It is the same failure that trapped `/favicon.ico` earlier, one level up:
then it was a cached 404 on one file, now it is a cached copy of the whole
HTML page.

**What changed in the code.** `Cache-Control: no-cache` clearly was not
enough, so the HTML, the manifest, `robots.txt` and `sitemap.xml` now go out
with:

```
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
CDN-Cache-Control: no-store
Cloudflare-CDN-Cache-Control: no-store
Pragma: no-cache
```

Cloudflare ranks the last two above `Cache-Control` and honours them even
under a "Cache Everything" rule, which normally ignores what the origin asks
for. The icons are untouched by this — they are content-addressed, so they
keep their one-year `immutable` cache.

**What only you can do.** Headers govern what gets cached *from now on*.
They cannot evict the copy the edge is already holding. That page has to be
purged by hand, and until it is, you will keep seeing the old one no matter
what either of us ships:

1. Cloudflare → Caching → Configuration → **Purge Everything**.
2. Then check Caching → Configuration and Rules for a **Cache Everything**
   page rule on this domain. If one exists, either delete it or set its Edge
   TTL to **Respect Existing Headers** — otherwise the edge will re-pin the
   page and this recurs.
3. Confirm with `https://johndaleverthechanova.com/` in a private window.
   The title should read **Engr. Johndaleverth Pastorfide Echanova**. If a
   `?cachebust=1` version shows the new title and the bare URL does not, the
   purge did not take.

### v103: the editor's tab icon (my regression) and the second "P."

Two separate things, both real, neither of them the CDN.

**The blank tab was the EDITOR, not the portfolio.** The screenshot said
"Portfolio Editor" — a different page with its own `<head>`, and I had only
ever fixed `index.html`. `editor.html` still carried this from before any of
this work started:

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,...viewBox='0 0 64 64'/...">
```

An **empty** 64x64 SVG. It was a deliberate placeholder back when
`favicon.js` painted the real icon into a canvas afterwards — so when I
stopped that script painting tab icons in v97, I left the editor showing a
blank with nothing to replace it. That one is mine.

Fixed at the source rather than by patching one more file: the editor is now
rendered through the **same** icon path as the site, so it gets the inline
32x32 `data:` URI and the versioned URLs exactly as the portfolio does. The
404 page got real icon links too. A page added later cannot quietly miss out.

**The second "P." was a second setting.** The name appears in two different
database rows: `site_title` drives the tab and the search result,
`hero_name_rest` drives the big name on the page. The v101 migration only
rewrote the first, so the tab said "Pastorfide" and the page still said
"P." — which is precisely what you were looking at.

The migration now walks every setting rather than one named key:

```
site_title      'Engr.Johndaleverth P. Echanova'  ->  'Engr. Johndaleverth Pastorfide Echanova'
hero_name_rest  'P. Echanova'                     ->  'Pastorfide Echanova'
```

Both patterns are narrow enough to be safe anywhere — "P." only ever stands
for "Pastorfide" when it sits between those names or directly before the
surname — and once expanded nothing matches, so it is a no-op on every later
start.

**Measured on both tabs**, four loads each (one fresh, three refreshes):

```
portfolio  first icon at t=47ms | tab-icon network fetches over 4 loads: 0
editor     first icon at t=61ms | tab-icon network fetches over 4 loads: 0
```

Zero fetches. The icon is in the document, so there is nothing to wait for
on either page.

**One correction to something I broke and fixed quietly:** while editing
`seed.py` I truncated the file, which removed `seed_if_empty` and stopped
the app booting. It is restored and verified byte-identical to the original,
and the seed data above it is untouched. Flagging it because you would have
no way to know otherwise.

### v104: the icon now arrives in the first packet — and where the limit is

The inline icon was sitting about **3,400 bytes** into the response, behind
the viewport meta, the description, and a long explanatory comment. The
browser had to receive and parse all of that before it had an icon to show.

It is now **97 bytes in**, directly after `<meta charset>`:

```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,...
```

That is as early as it can legally go — the charset declaration has to come
first, because it must appear within the first 1024 bytes or the browser
re-decodes the document. The icon is now inside the very first packet of the
response, parsed essentially the moment the response begins arriving.

Applied to the portfolio and the editor alike, and re-measured: still zero
network requests for a tab icon across four loads of each page.

### The part that cannot be fixed, and why

There is a window during any navigation where the browser has thrown away
the old document and not yet received the new one. The tab icon belongs to
the document, so in that window there is nothing for the tab to display —
it shows a spinner. **No website can override this**, because at that moment
the site has not been asked for anything yet. It is not a favicon setting, a
cache header, or a `<link>` attribute.

What a site can control is how long that window lasts, and there are exactly
two levers:

1. **How early the icon appears in the HTML.** Now 97 bytes — first packet.
   This one is finished; there is nothing left to win.
2. **How fast the server answers at all.** This is the one that is still
   worth attention. If the host has gone to sleep, the first request after
   it wakes can take many seconds, and every one of those seconds is a tab
   with no icon. That is almost certainly what a long gap is.

The repository already ships `.github/workflows/keep-awake.yml`, which pings
`/api/health/db` every five minutes to stop the service sleeping. If the gap
you see is measured in seconds rather than a flicker, check that the workflow
is enabled and actually succeeding in the repo's Actions tab — a sleeping
service produces exactly this symptom, and no amount of favicon work will
touch it.

### v105: that is Chrome's loading spinner, not a missing icon

The screenshot finally made it clear. The mark at the left of the tab is not
an empty favicon — it is **Chrome's loading spinner**, which Chrome draws in
the favicon's place for as long as a page is loading. Every site does this.
Open github.com or google.com and press refresh: the same spinner, in the
same spot, for the same reason.

It cannot be turned off. There is no header, meta tag or favicon trick that
suppresses it, because it is the browser's own UI reporting the state of the
navigation. What a site controls is how long it is on screen: **the spinner
stops at the page's `load` event**.

So the question stops being "how do I keep the icon visible" and becomes
"what is holding the load event open". Measured:

```
time to first byte              33 ms
DOMContentLoaded               359 ms
load event (SPINNER STOPS)     400 ms
```

And the biggest single item in that window was **three.js — 654KB, plus the
45KB robot — loading on every page**, when the robot appears on exactly one
of them. Everyone who never opened the chat was downloading 699KB before
their tab could stop spinning.

Both are now fetched the first time the chat view is actually opened, not
before. Verified: on the home page `THREE` and `Robot3D` are `undefined` and
neither file is requested; on the chat page both load in order, the robot
mounts, the WebGL canvas appears and the flat fallback stays hidden. The
scripts are appended with `async = false` so they still execute in order —
`robot3d.js` needs `THREE` to exist before it runs.

On a fast local connection this moves the load event from 438ms to 400ms,
which sounds like nothing. On a phone on mobile data, 699KB is the
difference between a spinner that blinks and one that sits there for
seconds.

**If the spinner still runs for seconds after this**, the remaining cause is
the server taking that long to answer, which on a free-tier host means it
had gone to sleep. `.github/workflows/keep-awake.yml` exists to prevent
exactly that — worth confirming it is enabled and passing in the repo's
Actions tab.

### v106: sound in the editor, and a guided tour on both pages

**The editor now sounds like the site.** `sfx.js` and `uisound.js` are
loaded there, so presses, hovers, keyboard activation and typing all work
exactly as they do on the portfolio, and the sound switch in the editor's
topbar shares its stored preference with the public site — mute in one and
you are muted in both.

On top of that, `editorsound.js` covers the events that only exist here.
Each is worth hearing because it happens at the END of something you asked
for, when your eyes are likely somewhere else on the form:

| What happens | What you hear |
|---|---|
| A save, an upload or a removal completes | a new `save()` voice — two rising notes and a small metallic latch |
| A save fails, or the admin key is wrong | `error` |
| The editor unlocks | `join` |
| Switching between the five panes | `reveal` |
| A social link, discovery or track row added / removed | `open` / `close` |
| Pressing anything destructive | `error`, on the press — the confirm dialog blocks the thread, so a sound fired after it would arrive long after the decision |

All of it is wired by **observing** the interface rather than by editing the
twenty-odd functions that produce these outcomes. A save path added later is
covered the day it is written, and no existing function grew a line of audio
bookkeeping.

One thing that had to be solved to make that work: rendering also changes
the interface. Opening the Settings tab fills three lists and writes two
status lines, and the first version announced five events nobody caused —
two saves and three rows added, just for clicking a tab. There is now a
short quiet period after any render. A person cannot save, add a row and
delete something within 900ms of switching tabs; a browser paints all of it
in twenty. That gap is what separates a real action from a repaint.

**A guided tour, on both pages.** A `?` button — in the navigation rail
beside the theme dial and the sound switch on the site, in the topbar on the
editor. It spotlights one control at a time with a card explaining it:
14 steps for the portfolio, 9 for the editor.

- <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Esc</kbd> to leave, or click the
  dimmed area.
- Steps that live on another section navigate there first, using the site's
  own router, and wait for the transition before measuring anything.
- **A step whose control is not on the page is skipped, not shown ringing
  empty space.** The resume button only exists once a CV is uploaded; the
  leaderboard only once someone has played. Verified: on a fresh database
  both dropped out of the run silently.
- The spotlight does not block clicks, so the control being described stays
  usable while you read about it.
- It is never shown uninvited. The button pulses until the tour has been
  taken once, then stops.

Verified end to end: all 14 portfolio steps walked with the keyboard through
four view changes and back, all 9 editor steps behind the login gate, and on
a 390px phone viewport the card stayed fully inside the screen at every step.

One flaw the test caught and fixed: a step that switched view left the card
showing the PREVIOUS step's title for about half a second while the
transition settled. The words are now painted before navigation runs, so
only the ring has to catch up.

### v107: 485KB lighter, and three voices nothing ever called

An audit first, the same way as last time. Every file under `static/` is
referenced by something — no orphans. What there was:

**The three shipped speech clips were uncompressed WAV.** 516KB of raw PCM,
more than every script on the page put together, for 12 seconds of audio.
They are now MP3 at 56kbps mono: **83KB**, a 432KB saving.

Not taken on faith — each was decoded back to PCM and correlated against the
original:

| clip | WAV | MP3 | correlation | duration |
|---|---|---|---|---|
| code-transform | 51KB | 8KB | 0.9932 | 1.20s → 1.20s |
| whoami-robot | 67KB | 11KB | 0.9985 | 1.57s → 1.57s |
| voice-preview | 397KB | 63KB | 0.9977 | 9.22s → 9.22s |

0.998 is far past anything audible in a robot voice. `decodeAudioData`
handles MP3 in every browser that can run the Web Audio API, so only three
URLs changed — and all three were then decoded in a real browser to confirm
they come back at exactly their original lengths. Speech generated on demand
for arbitrary text still returns WAV; there is nothing to gain by
compressing something made once and thrown away.

**Two icon files were duplicates of a third.** `apple-touch-icon.png` (38KB)
and `icon-96.png` (15KB) were both the same portrait at a different size, and
the icon route already falls back through a chain. Deleting the files costs
nothing: `/apple-touch-icon.png` now serves the 192 PNG, which is what every
device does with a 180 slot anyway. The *path* stays, because iOS asks for it
by name whether or not a page declares it. `/icon-96.png` was a route nothing
linked to and nothing probes by convention, so that one is gone entirely.

**Three sound voices had never been called.** `vox()` was written for a robot
speech intro that was replaced; `ping()` was added for the old robot's
antennae and never wired to anything; `off()` was the counterpart to `on()`
in the mute switch, except muting is deliberately silent — so it was
unreachable by design. 22 lines removed, and every remaining voice verified
still present.

What was examined and deliberately left alone: the portrait is already
losslessly compressed and 883px is the floor for a 3x phone at its displayed
size; `icon-512.png` resists palette compression because of its alpha and is
what Android uses for the install splash; `check_db.py` is unreferenced by
the app but is a database inspection tool, and database state is the thing
that keeps biting this deployment.

Re-verified after all of it: every icon URL returns a round image, all three
clips decode to their exact original durations, both tours walk end to end,
the editor's sounds fire on the right events and nothing else, and the robot
still mounts on the chat page.

### v108: the tour is now something you DO, and the editor's is private

**Every step you can act on now waits for you to act on it.**

A task step has no Next button. It shows a live "Try it" strip, and it
advances only when the thing has genuinely happened — the arrow key will
not move past it either. Nothing is simulated: each step listens to the
site's own events and state, so if the tour says you opened Projects, the
router really ran.

| Step | What it waits for |
|---|---|
| The navigation rail | the rail is measurably expanded |
| The theme dial | a real click on it |
| Sound | the site's own `sfx-mute` event |
| The terminal | the portrait actually revealed — you typed `whoami` |
| Projects / Achievements / Tools / Chat | `portfolio-section-change` for that section |
| The robot | `robot-hp` reporting damage below 100 |

Three steps stay read-only on purpose — the welcome, the live viewer count
and the sign-off are things to notice, not press, and inventing busywork for
them would be worse than a button. Any step can still be skipped, because a
control can be broken, unreachable on a device, or already in the state
being asked for.

**Four real bugs surfaced only once the steps became interactive**, and none
of them would ever have shown up in a click-through tour:

1. *The overlay swallowed every click.* It covered the viewport to dim the
   page, which is harmless when you only ever press Next and fatal when the
   step asks you to press something underneath. The overlay is now
   transparent to the pointer and only the card's buttons take clicks.
   Clicking the dim area no longer exits either — on an interactive tour,
   clicking the page *is* the task.
2. *The page was frozen.* `overflow: hidden` on the body meant a step could
   ask for a control you were unable to scroll to.
3. *The card covered the control it was pointing at.* A tall target like the
   rail leaves no room above or below, and the clamp that keeps the card on
   screen pushed it straight back over the button. It now checks its final
   position and moves to whichever side has room, and a step can name
   something else to stay clear of.
4. *An infinite oscillation.* The card rested on the cursor, which took
   `:hover` away from the rail, which collapsed it, which moved the theme
   dial 250px, which moved the card, which gave the hover back. Measured at
   2Hz, the dial bounced between y=446 and y=697 forever. The card is now
   hover-transparent, and the spotlight re-measures its target every frame
   for the first 1.5 seconds and four times a second after.

**The help button moved to the topbar.** It was in the navigation rail with
the theme dial — which is where the site's *tools* belong, but this is for
someone who has just arrived and does not know the rail exists. Inside a
collapsed rail it was `display: none`, so the pulse meant to catch a
first-timer's eye could not be seen by one. It is now always visible, at
every width.

**The editor's walkthrough is separated from the portfolio's.**

The public tour ships as a plain file, because it describes a page anyone
can already look at. The editor's does not: it is a labelled map of the
admin interface — which control writes to the database, which one deletes
without a second prompt, where the uploads live.

It now comes from `/api/editor/tutorial`, behind the same admin dependency
as every other editor endpoint. Verified: **401 with no key, 401 with a
wrong key, 200 with the right one.** `tour-editor.js` contains no step text
at all — confirmed by fetching the file in the browser and searching it —
and what the endpoint returns is treated as data, never code: a step names
what it wants to wait for and the browser maps that name to a listener, so
an unrecognised one produces a step with no task rather than a step that
does something unexpected.

Worth being straight about the limit: `editor.html` is still a public URL,
so its structure can be read by anyone determined to. This removes a
ready-made explanation of that structure from the public bundle. The admin
key remains the actual protection.

Both walkthroughs were walked end to end by a browser doing the real
actions — 14 steps on the portfolio through four section changes, 10 on the
editor behind the login gate — plus the card verified fully on screen at
every step on a 390px phone.

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
