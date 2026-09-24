# Portfolio v115 — the thumbnail is gone; the circle needs time

## 1. The photo on the right is removed

Added to the home page's `<head>`:

```html
<meta name="robots" content="index, follow, max-image-preview:none">
```

That is Google's own documented control for this, and its definition is
exactly one sentence: *"No image preview is to be shown."* It is what was
putting the large picture to the right of your result, and it is now off.

**og:image was deliberately left in place.** Facebook, LinkedIn, Messenger,
Twitter/X and Discord read Open Graph and ignore Google's robots directives —
so when you share your link anywhere, it still produces a proper card with a
picture. Only the Google Search result goes plain.

The honest trade-off: this also keeps the page's images out of image previews
generally. If you ever want the thumbnail back, delete that one line and
request indexing again.

It needs a recrawl to take effect, same as the name did.

## 2. The favicon: what is actually true right now

The fix for the circle went live **minutes before you asked.** v114 is the
version that put a crawlable URL ahead of the inline `data:` copy, and Google
has not had a chance to re-fetch the icon since.

That matters because the favicon does **not** refresh with the page. It is a
separate pipeline on its own schedule — days to a few weeks for a home page —
which is why your name updated first and the icon did not. One updating
without the other is the normal shape of this, not a second fault.

### What I checked, so nothing speculative is left in the way

| Cause of the grey globe | Your site |
|---|---|
| robots.txt blocks the icon | No — every icon path is explicitly allowed |
| Wrong `rel` value | No — `rel="icon"` and `rel="apple-touch-icon"` |
| Too small | No — 192×192 first (a multiple of 48, which is what Google wants), 512 after |
| A redirect instead of a direct 200 | No — `/brand-icon.png` answers 200 directly, GET and HEAD |
| Injected by JavaScript after load | No — the tags are in the HTML the server sends |
| Wrong MIME type | No — `image/png` |
| Uncrawlable reference first | **Fixed in v114** — this was the real one |

### The one thing I chose NOT to change

Your icon is circle-masked, so its corners are transparent, and I said last
time that might be the next suspect. Having read the actual reports: a
transparent favicon does not get rejected by Google — it gets **composited
onto a white background**. People who hit this see their icon with a white
square behind it, not a globe.

So transparency is not what is stopping you, and flattening the icon would
cost you the round tab you spent a long time getting right for no gain. Left
alone on purpose.

## What to do

1. Upload this, let it deploy.
2. Search Console → URL Inspection → home page → **Request Indexing**. Once.
3. Leave it alone for a few days.

The thumbnail will disappear on the next index update. The icon will follow on
the favicon pipeline's own schedule, which is slower. There is no third thing
to change — the site is serving everything Google asks for.

---

Sources:
[Google — robots meta tag, `max-image-preview`](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) ·
[Google — favicon in search results](https://developers.google.com/search/docs/appearance/favicon-in-search) ·
[Favicon not showing in Google Search: causes](https://seotest.app/blog/favicon-not-showing-in-google-search)
