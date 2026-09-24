"""Turn an uploaded picture into the site's circular icon.

Why this is done on the SERVER and not only in the browser.

The round tab icon used to be produced entirely by favicon.js: it fetched the
uploaded file, drew it into a canvas with a circular mask, and handed the
result to the tab. That works, and only for the tab. Everything else that
asks this site for an icon — a search crawler, a phone adding the site to a
home screen, a link unfurler in a chat app — receives whatever raw file was
uploaded, square corners and all, because none of them run the page's
JavaScript.

So an upload produced a round icon in one place and a square one everywhere
else, from the same picture. Masking once, here, at upload time, means every
consumer gets the same circle. The browser-side code still runs and is still
useful (it re-crops instantly when the icon changes), but it is no longer the
only thing standing between an upload and a round icon.

Pillow is imported defensively. If it is unavailable the caller stores the
original bytes exactly as before — an un-cropped icon is a much smaller
problem than an upload endpoint that raises.
"""
from __future__ import annotations

import io

try:
    from PIL import Image, ImageDraw
except Exception:  # pragma: no cover - the upload path must survive this
    Image = None
    ImageDraw = None

# The navy the bundled icons are ringed with. A photo's own background is
# usually mid-grey or white and disappears against a light search-results
# page; the ring is what gives the icon a defined edge on any background.
RING_RGBA = (13, 26, 40, 255)

# Composite big and downscale once at the end. Masking at the target size
# leaves visibly stair-stepped edges at 16px, which is the size that matters
# most and the one nobody checks.
SUPERSAMPLE = 1024


def available() -> bool:
    return Image is not None


def circular_png(raw: bytes, size: int = 512, ring: bool = True) -> bytes | None:
    """A square, circular-masked PNG of `raw`, or None if it can't be made."""
    if Image is None or not raw:
        return None
    try:
        src = Image.open(io.BytesIO(raw))
        src.load()
    except Exception:
        return None

    try:
        src = src.convert("RGBA")

        # Centre-crop to a square first: a portrait squashed into a circle is
        # worse than a portrait cropped to one.
        w, h = src.size
        if not w or not h:
            return None
        side = min(w, h)
        src = src.crop(((w - side) // 2, (h - side) // 2,
                        (w - side) // 2 + side, (h - side) // 2 + side))
        src = src.resize((SUPERSAMPLE, SUPERSAMPLE), Image.LANCZOS)

        canvas = Image.new("RGBA", (SUPERSAMPLE, SUPERSAMPLE), (0, 0, 0, 0))
        ImageDraw.Draw(canvas).ellipse((0, 0, SUPERSAMPLE - 1, SUPERSAMPLE - 1),
                                       fill=RING_RGBA)

        inset = int(SUPERSAMPLE * 0.055) if ring else 0
        inner_side = SUPERSAMPLE - 2 * inset
        inner = src.resize((inner_side, inner_side), Image.LANCZOS)
        inner_mask = Image.new("L", (inner_side, inner_side), 0)
        ImageDraw.Draw(inner_mask).ellipse((0, 0, inner_side - 1, inner_side - 1), fill=255)
        canvas.paste(inner, (inset, inset), inner_mask)

        outer = Image.new("L", (SUPERSAMPLE, SUPERSAMPLE), 0)
        ImageDraw.Draw(outer).ellipse((0, 0, SUPERSAMPLE - 1, SUPERSAMPLE - 1), fill=255)
        canvas.putalpha(outer)

        out = io.BytesIO()
        canvas.resize((size, size), Image.LANCZOS).save(out, format="PNG", optimize=True)
        return out.getvalue()
    except Exception:
        return None
