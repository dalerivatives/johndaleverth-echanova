# Portfolio v113 — the search result, and a 404 nobody would have seen

## Your question: is the globe normal after a day?

**Yes — and your own screenshot proves Google has not looked yet.**

Look at the title in the result: *"Engr.Johndaleverth **P.** Echanova"*.

The live site says something else:

```
<title>Engr. Johndaleverth Pastorfide Echanova</title>
```

That "P." is the version from **before** the name was expanded. So the whole
entry — title, description and favicon — is a snapshot Google took before any
of the icon or name work landed. The favicon is not being rejected. It has
not been fetched.

Google's own documentation on this: *"Allow time for Google to recrawl and
process the new information on your home page. Remember that crawling can
take anywhere from several days to several weeks."*

The title and the favicon update together, on that same recrawl. When the
name in that result changes to **Pastorfide**, the icon will have been
refreshed too — so the title is a free progress indicator. Watch it.

### To skip the queue

Google Search Console → **URL Inspection** → paste
`https://johndaleverthechanova.com/` → **Request indexing**. That is the one
supported way to ask for a recrawl instead of waiting. Practitioners report
results in hours to a day.

### What was verified while checking

* The live title is correct — `Pastorfide`, not `P.`
* `robots.txt` explicitly allows every icon path, and does not block the home
  page. Google requires both.
* Every icon is served as a real, square PNG: `/brand-icon.png` is 192×192,
  `/brand-icon-512.png` is 512×512, `/brand-icon-touch.png` is 192×192,
  `/favicon.ico` is a true multi-size ICO. Google wants square, at least
  8×8, and recommends over 48×48. All pass.

---

## What was actually broken: HEAD returned 404 on every icon

Measured, before this version:

```
GET  /brand-icon.png  ->  200  image/png
HEAD /brand-icon.png  ->  404  text/html
```

The same on `/brand-icon-512.png`, `/brand-icon-touch.png`,
`/site.webmanifest`, and all three `/api/health*` endpoints.

**Why.** FastAPI's `@app.get` registers **GET only** — unlike Starlette's own
`Route`, which quietly adds HEAD beside it. So a HEAD request matched no
route, fell through to the static file mount at `/`, found no file by that
name, and came back 404.

**Why it matters.** Crawlers, CDNs, link-preview bots and uptime monitors all
use HEAD, and a fair number read a 404 as *"this file does not exist"* without
ever trying a GET. On a site whose icons sit behind a CDN that has already
been caught caching a 404 for an icon path once, that is not theoretical —
it is the same bug in a different hat.

Every page and asset route now answers GET and HEAD identically:

```
/                     GET 200   HEAD 200   text/html
/favicon.ico          GET 200   HEAD 200   image/x-icon
/brand-icon.png       GET 200   HEAD 200   image/png
/brand-icon-512.png   GET 200   HEAD 200   image/png
/brand-icon-touch.png GET 200   HEAD 200   image/png
/site.webmanifest     GET 200   HEAD 200   application/manifest+json
/api/health/db        GET 200   HEAD 200   application/json
...16 routes in total
```

## Also: robots.txt was blocking the status endpoint I told you to monitor

`KEEP_AWAKE.md` suggests pointing an outside uptime monitor at
`/api/health/awake`. `robots.txt` carved out `/api/health` and
`/api/health/db` from the blanket `Disallow: /api/` — but not `awake`. Plenty
of monitors read robots.txt and honour it, so that one would have been
politely refused. Now allowed.

---

## One thing I deliberately did NOT change

The first `<link rel="icon">` in your `<head>` is the inline `data:` copy —
the one that paints the tab instantly, which took a long time to get right.
Google needs a **crawlable** icon file, and a `data:` URI is not one.

It may not matter: `apple-touch-icon` and `/favicon.ico` are both real URLs
Google supports and can fall back to. And right now there is no evidence
Google has even fetched the page, so moving that tag would be changing
something that works to fix something not yet shown to be broken.

**So: request indexing first.** If the title in your search result updates to
*Pastorfide* and the icon is still a globe, that is the moment we know the
inline tag is the problem — and then it is a two-line change. Tell me and
I'll make it.

---

Sources:
[Google — Define a favicon to show in search results](https://developers.google.com/search/docs/appearance/favicon-in-search) ·
[Debugging favicon problems in Google Search](https://www.gsqi.com/marketing-blog/favicon-problems-google-search/)
