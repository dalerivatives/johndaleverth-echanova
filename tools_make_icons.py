"""Regenerate the site's icon set from the portrait, and emit the embedded copy.

A favicon is looked at between 16 and 48 pixels wide. A full portrait at that
size is an unreadable smudge, so the crop is the face and little else. The
studio backdrop is mid-grey and disappears against a light search-results
page, so a thin navy ring gives the icon a defined edge on any background.

Everything is composited at 2048px and downscaled once at the end; masking at
the target size leaves visibly stair-stepped edges at 16px.
"""
import base64
from pathlib import Path
from PIL import Image, ImageDraw

SRC = "/root/.claude/uploads/3cde5e99-0245-5278-adf7-85a4a48ea9da/f07572da-image.jpg"
STATIC = Path("static")
SS = 2048
RING = (13, 26, 40, 255)

im = Image.open(SRC).convert("RGB")
W, H = im.size
cx, cy, side = int(W * 0.475), int(H * 0.34), int(W * 0.54)
box = (cx - side // 2, max(0, cy - side // 2), cx + side // 2, max(0, cy - side // 2) + side)
head = im.crop(box).resize((SS, SS), Image.LANCZOS).convert("RGBA")

comp = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
ImageDraw.Draw(comp).ellipse((0, 0, SS - 1, SS - 1), fill=RING)

inset = int(SS * 0.055)
inner_size = SS - 2 * inset
inner = head.resize((inner_size, inner_size), Image.LANCZOS)
inner_mask = Image.new("L", (inner_size, inner_size), 0)
ImageDraw.Draw(inner_mask).ellipse((0, 0, inner_size - 1, inner_size - 1), fill=255)
comp.paste(inner, (inset, inset), inner_mask)

outer = Image.new("L", (SS, SS), 0)
ImageDraw.Draw(outer).ellipse((0, 0, SS - 1, SS - 1), fill=255)
comp.putalpha(outer)

icon512 = comp.resize((512, 512), Image.LANCZOS)
icon512.save(STATIC / "icon-512.png")
icon512.resize((192, 192), Image.LANCZOS).save(STATIC / "icon-192.png")
icon512.resize((180, 180), Image.LANCZOS).save(STATIC / "apple-touch-icon.png")
icon512.resize((96, 96), Image.LANCZOS).save(STATIC / "icon-96.png")
icon512.save(STATIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

# The copy that lives in the source tree as text, so no deploy can lose it.
embedded = STATIC / "icon-192.png"
b64 = base64.b64encode(embedded.read_bytes()).decode("ascii")
lines = [b64[i:i + 76] for i in range(0, len(b64), 76)]
body = "\n".join('    "%s"' % l for l in lines)

module = '''"""The site icon, as bytes, in the source tree.

Why a base64 blob and not just a file in static/: a file can fail to reach
the server. One deploy went out without static/favicon.ico, the icon route
404'd, a CDN cached that 404 against the URL, and the search result showed a
grey placeholder for weeks afterwards — a long way from the one missing file
that caused it.

This module cannot go missing, because if it did the application would not
import at all. It is the last link in the icon chain: the uploaded icon wins,
then the files in static/, and then this. The practical effect is that the
icon route has no failure mode left that returns nothing.

192x192 PNG, ~%dKB as base64. Regenerate with the script that produced it
rather than editing by hand.
"""
import base64

ICON_PNG_B64 = (
%s
)

ICON_PNG = base64.b64decode(ICON_PNG_B64)
ICON_MIME = "image/png"
''' % (len(b64) // 1024, body)

Path("backend/icon_data.py").write_text(module, encoding="utf-8")

print("icon-512.png  ", (STATIC / "icon-512.png").stat().st_size, "bytes")
print("icon-192.png  ", (STATIC / "icon-192.png").stat().st_size, "bytes")
print("favicon.ico   ", (STATIC / "favicon.ico").stat().st_size, "bytes")
print("icon_data.py  ", Path("backend/icon_data.py").stat().st_size, "bytes")

# Preview sheet: the sizes that actually get looked at, on both page colours.
sheet = Image.new("RGB", (540, 205), (245, 245, 247))
big = Image.alpha_composite(Image.new("RGBA", (185, 185), (245, 245, 247, 255)),
                            icon512.resize((185, 185), Image.LANCZOS))
sheet.paste(big.convert("RGB"), (10, 10))
x = 215
for s in (48, 32, 16):
    t = icon512.resize((s, s), Image.LANCZOS)
    z = Image.alpha_composite(Image.new("RGBA", t.size, (245, 245, 247, 255)), t)
    sheet.paste(z.resize((s * 3, s * 3), Image.NEAREST).convert("RGB"), (x, 10))
    x += s * 3 + 16
dark = Image.new("RGB", (540, 100), (32, 33, 36))
x = 10
for s in (48, 32, 16):
    t = icon512.resize((s, s), Image.LANCZOS)
    z = Image.alpha_composite(Image.new("RGBA", t.size, (32, 33, 36, 255)), t)
    dark.paste(z.resize((s * 3, s * 3), Image.NEAREST).convert("RGB"), (x, 10))
    x += s * 3 + 16
out = Image.new("RGB", (540, 310), (245, 245, 247))
out.paste(sheet, (0, 0)); out.paste(dark, (0, 207))
out.save("/tmp/claude-0/-home-claude/3cde5e99-0245-5278-adf7-85a4a48ea9da/scratchpad/icon_sizes.png")
