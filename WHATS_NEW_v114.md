# Portfolio v114 — the favicon slot

## First: there are TWO images in your search result, not one

They come from different places and only one of them is the favicon.

| Where | What it is | Where Google gets it |
|---|---|---|
| Big photo, right side | The **result thumbnail** | `og:image` → `/assets/og-preview.jpg` |
| Small circle, beside the domain | The **favicon** | `<link rel="icon">` in your `<head>` |

The thumbnail on the right is working, and it is a separate Google feature —
not your favicon in the wrong position. Nothing can move it into the circle;
they are two different slots filled from two different sources.

The circle is the one still showing a globe, and that is what this version
goes after.

## The index DID update

Your result now reads **"Engr. Johndaleverth Pastorfide Echanova"**. That is
the recrawl landing — Google re-read the page and took the new title. So the
waiting part is over and the page itself is indexed correctly.

Which is exactly the signal that was worth waiting for: the title updated and
the icon did not, so this is no longer "Google has not looked". It has looked.

## What was probably stopping it

Your `<head>` opened like this:

```html
<meta charset="UTF-8">
<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,…">
```

That inline `data:` copy is the one that paints your browser tab instantly —
it is why the tab is never blank on a reload, which took a long time to get
right. But Google's requirement is explicit: *"Googlebot-Image must be able to
crawl the favicon file."* A `data:` URI is not a file. It cannot be fetched.
So the first `rel="icon"` in your document offered the crawler nothing, and a
grey globe is the documented outcome when the icon reference Google finds does
not meet the guidelines.

## The fix, and why it costs nothing

A crawlable URL now goes first, and the inline copy second:

```html
<meta charset="UTF-8">
<link rel="icon" type="image/png" sizes="192x192" href="/brand-icon.png?v=…">
<link rel="icon" type="image/png" sizes="32x32"   href="data:image/png;base64,…">
```

The crawlable link is **moved**, not copied, so the page never carries the
same href twice — duplicate references are themselves a known cause of the
globe.

**The browser is unaffected, and this was measured rather than assumed.** A
browser does not take the first icon it sees; it takes the one whose declared
size is closest to what a tab needs. That is still the 32×32 inline copy.
Across four cold loads of both pages, before and after:

```
before   first icon at 45ms   icon network fetches: 0
after    first icon at 43ms   icon network fetches: 0
```

Same instant paint, still zero network requests for an icon. Nothing you
fought for on the tab has been given back.

## What to do

1. Upload this and let it deploy.
2. Search Console → URL Inspection → your homepage → **Request Indexing**.
   Once.
3. Wait. Favicons are refreshed on their own schedule, which lags the page
   index — the name updating before the icon is normal, not a second fault.

Optional and harmless while you wait: open
`https://www.google.com/s2/favicons?domain=johndaleverthechanova.com&sz=512`
and again with `&sz=1024`. Google's favicon service caches per size, so
asking for a size it has never generated can push it to go and fetch yours.

## If it is still a globe in a few days

Then the `data:` tag was not the cause and the next suspect is the icon's
transparent corners — it is circle-masked, and Google composites favicons
onto its own background. The test would be a square, fully opaque version.
Say the word and I will make one.

---

Sources:
[Google — Define a favicon to show in search results](https://developers.google.com/search/docs/appearance/favicon-in-search) ·
[Debugging favicon problems in Google Search](https://www.gsqi.com/marketing-blog/favicon-problems-google-search/)
