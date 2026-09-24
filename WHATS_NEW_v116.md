# Portfolio v116: favicon cleanup, one deploy

Nothing here changes how the site looks. The icon's address stays the same
(`/brand-icon.png?v=7f493895b30c` for the photo uploaded now), so Google does
not have to start over.

## 1. robots.txt

- **Added `Googlebot` and `Googlebot-Image` sections** that explicitly allow
  `/favicon.ico` and `/brand-icon.png`. They repeat the editor and `/api/`
  blocks, because a crawler with its own section ignores `User-agent: *`.
- **Removed the blank lines inside each section.** The older robots.txt
  standard treats a blank line as the end of a section, so for non-Google
  crawlers (Bing, for example) the `Disallow` lines further down were being
  dropped and `/editor.html` was open to them. Google was never affected.
- **Removed `Allow: /`.** Everything is allowed by default, and crawlers
  that apply the first rule they match stopped at that line.

Tested: Googlebot, Googlebot-Image, Bingbot and generic crawlers can all
fetch `/`, the pages and every icon, and are all blocked from `/editor.html`
and `/api/` (except `/api/health*`, which uptime monitors need).

## 2. Each icon address now matches its declared size

With a photo uploaded in the editor, every icon address used to return the
same 512×512 PNG, including `/favicon.ico`. Now:

| Address | Returns |
|---|---|
| `/brand-icon.png`, `/icon-192.png` | 192×192 PNG |
| `/brand-icon-touch.png`, `/apple-touch-icon.png` | 180×180 PNG |
| `/brand-icon-512.png`, `/icon-512.png` | 512×512 PNG |
| `/favicon.ico`, `/brand-icon.ico` | real ICO file (16, 32 and 48 px) |

These are all still the same round photo. They're generated from the upload
and cached in memory.

## 3. The icon address stays the same after a deploy

When no photo is uploaded, the `?v=` code on the icon links was built from
file modification times. A deploy resets those, so the address changed every
deploy. It's now built from the file contents. (With an uploaded photo it was
already built from the photo itself, and that's unchanged.)

## After deploying

1. Open `https://johndaleverthechanova.com/favicon.ico`. If it shows the old
   512px version, purge that URL in Cloudflare (Caching → Configuration →
   Custom Purge → URL).
2. Don't upload a new icon or change the icon links while waiting for Google.

## 4. Google can read your page's public content

robots.txt now also allows `/api/settings`, `/api/content/` and
`/api/github/`, the public, read-only data the home page loads for its text,
projects, achievements, tools and GitHub activity. Before, Google rendered
the page with those sections empty. Chat, presence, the robot game and the
editor stay blocked.
