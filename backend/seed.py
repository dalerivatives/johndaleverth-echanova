"""Seeds the database with starting content on first run, so the site
isn't empty before you've added anything through the editor.

It seeds ONCE per database and remembers that it has (the private
`_meta_seeded` setting). It used to re-seed any section that had no
headings on every restart, so emptying a section on purpose in the editor
brought the sample content back after the next deploy."""

import re
import json

from sqlalchemy.orm import Session

from . import models

SEED_DATA = {
    "project": [
        {
            "name": "Computer Vision",
            "items": [
                {
                    "title": "BroodiCare",
                    "description": (
                        "A chick-monitoring system powered by a YOLO11n detection model, "
                        "with a Python/FastAPI backend and a Next.js frontend. Diagnosed and "
                        "fixed a color-channel bug that was collapsing confidence scores, "
                        "retuned NMS IoU thresholds, and corrected canvas overlay alignment. "
                        "Added spatial behavior analysis — clustering vs. dispersing detection "
                        "— using the Clark-Evans nearest-neighbor index with Donnelly edge "
                        "correction."
                    ),
                    "tools": "YOLO11n, FastAPI, Next.js, Computer Vision",
                },
                {
                    "title": "Live Vision Suite",
                    "description": (
                        "A Flask + SocketIO web app wrapping a YOLOv8/OpenCV pipeline for "
                        "real-time detection, annotation, and training — alongside a separate "
                        "MobileNetV2-based live webcam object-detection tool."
                    ),
                    "tools": "Flask, SocketIO, YOLOv8, OpenCV, MobileNetV2",
                },
            ],
        },
        {
            "name": "Full-Stack Web",
            "items": [
                {
                    "title": "Trevelade Portfolio",
                    "description": (
                        "This site's own lineage: iterated through a dozen versions, evolving "
                        "from a single-file HTML portfolio into a full-stack application with "
                        "a FastAPI/SQLAlchemy backend, JWT authentication, and Cloudinary "
                        "media storage — deployed across GitHub Pages, Neon (PostgreSQL), and "
                        "Render."
                    ),
                    "tools": "FastAPI, SQLAlchemy, JWT, Neon, Render",
                },
                {
                    "title": "Offline Library OPAC",
                    "description": (
                        "A single-file, offline-first government document management system "
                        "built as one HTML app with localStorage persistence — no server, no "
                        "build step, fully portable."
                    ),
                    "tools": "HTML, localStorage, Offline-first",
                },
            ],
        },
        {
            "name": "Automation & Documents",
            "items": [
                {
                    "title": "Academic Deck Automation",
                    "description": (
                        "A code-built pipeline that turns academic papers into "
                        "presentation-ready decks — 50 to 100 slides — while preserving text "
                        "verbatim. Backgrounds are procedurally generated in a sumi-e "
                        "ink-wash style with PIL/NumPy, decks are assembled with pptxgenjs, "
                        "and every output passes a word-level diff and font-metric overflow "
                        "check before delivery."
                    ),
                    "tools": "pptxgenjs, PIL / NumPy, Automated QA",
                },
                {
                    "title": "Municipal Records Digitization",
                    "description": (
                        "Rebuilt a Philippine municipal government resolution and ordinance "
                        "from a scanned PDF into a fully formatted DOCX — programmatically "
                        "reconstructing the letterhead, attendance rosters, fee-schedule "
                        "tables, and signature blocks."
                    ),
                    "tools": "python-docx, Document Automation",
                },
            ],
        },
    ],
    "achievement": [
        {
            "name": "Education & Founding",
            "items": [
                {
                    "title": "Capstone Honors",
                    "description": (
                        "Graduated Computer Engineering from Marinduque State University — "
                        "Dean's Lister and Best in Capstone Project."
                    ),
                    "tools": "",
                },
                {
                    "title": "Founded a Device Repair Business",
                    "description": (
                        "Founded and run a device repair business in Santa Cruz, Marinduque, "
                        "alongside freelance technical consulting."
                    ),
                    "tools": "",
                },
            ],
        },
        {
            "name": "Shipped Builds",
            "items": [
                {
                    "title": "BroodiCare, fully verified",
                    "description": (
                        "Took BroodiCare's computer-vision pipeline from a broken "
                        "confidence-score bug to a fully verified, tested build."
                    ),
                    "tools": "",
                },
                {
                    "title": "100-Slide Verbatim Decks",
                    "description": (
                        "Built a document-automation pipeline that has generated dozens of "
                        "verbatim, presentation-ready academic decks — up to 100 slides each "
                        "— with programmatic QA baked in."
                    ),
                    "tools": "",
                },
                {
                    "title": "Portfolio Full-Stack Migration",
                    "description": (
                        "Rebuilt this portfolio from a static HTML page into a full-stack "
                        "app with authentication, cloud media storage, and a live deployment "
                        "pipeline."
                    ),
                    "tools": "",
                },
            ],
        },
        {
            "name": "Client Work",
            "items": [
                {
                    "title": "Bilingual Freelance Consulting",
                    "description": (
                        "Deliver freelance work across web, embedded systems, and computer "
                        "vision — communicating with clients in both English and Filipino."
                    ),
                    "tools": "",
                },
            ],
        },
    ],
    "tool": [
        {
            "name": "Languages",
            "items": [
                {"title": "Python", "description": "", "tools": ""},
                {"title": "JavaScript", "description": "", "tools": ""},
                {"title": "TypeScript", "description": "", "tools": ""},
                {"title": "C / C++", "description": "", "tools": ""},
                {"title": "HTML & CSS", "description": "", "tools": ""},
            ],
        },
        {
            "name": "Web & Backend",
            "items": [
                {"title": "FastAPI", "description": "", "tools": ""},
                {"title": "Flask", "description": "", "tools": ""},
                {"title": "Next.js", "description": "", "tools": ""},
                {"title": "React", "description": "", "tools": ""},
                {"title": "Node.js", "description": "", "tools": ""},
                {"title": "SQLAlchemy", "description": "", "tools": ""},
                {"title": "PostgreSQL", "description": "", "tools": ""},
                {"title": "JWT Auth", "description": "", "tools": ""},
            ],
        },
        {
            "name": "AI & Computer Vision",
            "items": [
                {"title": "YOLOv8 / YOLO11n", "description": "", "tools": ""},
                {"title": "OpenCV", "description": "", "tools": ""},
                {"title": "MobileNetV2", "description": "", "tools": ""},
                {"title": "PyTorch", "description": "", "tools": ""},
                {"title": "SocketIO", "description": "", "tools": ""},
            ],
        },
        {
            "name": "Embedded & Hardware",
            "items": [
                {"title": "Arduino", "description": "", "tools": ""},
                {"title": "GPIO / PWM", "description": "", "tools": ""},
                {"title": "Sensor Integration", "description": "", "tools": ""},
                {"title": "Rapid Prototyping", "description": "", "tools": ""},
            ],
        },
        {
            "name": "Automation & Docs",
            "items": [
                {"title": "python-docx", "description": "", "tools": ""},
                {"title": "pptxgenjs", "description": "", "tools": ""},
                {"title": "PIL / NumPy", "description": "", "tools": ""},
                {"title": "Programmatic QA", "description": "", "tools": ""},
            ],
        },
        {
            "name": "Platforms & DevOps",
            "items": [
                {"title": "Git & GitHub", "description": "", "tools": ""},
                {"title": "GitHub Pages", "description": "", "tools": ""},
                {"title": "Render", "description": "", "tools": ""},
                {"title": "Neon", "description": "", "tools": ""},
                {"title": "Cloudinary", "description": "", "tools": ""},
            ],
        },
    ],
}


# ---------------------------------------------------------------------------
# Editable site settings.
#
# Every key here becomes a field in the editor's "Site settings" tab, so all
# of the site's wording — not just the Projects/Achievements/Tools cards —
# can be changed without touching code. To add a new editable field: add a
# default here, then add an input with the matching data-setting attribute in
# static/editor.html. Nothing else needs to change.
#
# Blank social links are meaningful: the matching icon is removed from the
# live site entirely, so there's never a dead link that goes nowhere.
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS = {
    # --- identity (profile hero) ---
    "hero_eyebrow": "// COMPUTER ENGINEER",
    "hero_name_first": "Johndaleverth",
    "hero_name_rest": "Pastorfide Echanova",
    "hero_tagline": "Full Stack Developer · Embedded Systems Builder · Inventor",

    # --- the whoami terminal ---
    "terminal_line_1": "“Hello World.” I’m Dale — a Computer Engineer,",
    "terminal_line_2": "Full Stack Developer, Inventor, who enjoys building codes",
    "terminal_line_3": "and turning out of the “blue” ideas into Output",

    # --- footer ---
    "footer_text": "Developed by the Company Trevelade",

    # --- social links ---
    # A JSON list so any number can be added from the editor, each entry:
    #   {"title": "GitHub", "icon": "fa-brands fa-github", "url": "https://..."}
    # "icon" is a Font Awesome class string, or raw HTML/an image URL for a
    # logo the icon set doesn't have. Order here is the order on the site.
    "social_links": json.dumps([
        {"title": "GitHub", "icon": "fa-brands fa-github", "url": "https://github.com/dalerivatives"},
        {"title": "Email", "icon": "fa-solid fa-envelope", "url": "mailto:johndaleverthpechanova@gmail.com"},
    ]),

    # --- the animated background ---
    # Two layers behind the page: drifting code/formula snippets, and
    # generated algorithm graphs (trees, meshes, shortest-path networks) that
    # animate a traversal. Both are configurable so the background can be
    # tuned or switched off without touching the code.
    "bg_code_on": "1",
    "bg_code_density": "26",          # snippets on a desktop-width screen
    "bg_code_speed": "1",             # multiplier; 0.5 = half speed
    # One snippet per line. Blank falls back to the built-in set.
    "bg_code_snippets": "\n".join([
        "const future = build(idea);",
        "function create(value){ return output; }",
        "git commit -m 'ship it'",
        "while(alive){ learn(); }",
        "SELECT * FROM ideas;",
        "npm run build",
        "HTTP 200 / SYSTEM ONLINE",
        "docker compose up -d",
        "await queue.drain();",
        "if (dream) { code(); }",
        "sensor.read(TEMP);",
        "model.fit(data);",
        "E = mc²",
        "A = πr²",
        "F = ma",
        "∇ × E = -∂B/∂t",
        "O(n log n)",
        "P(A|B) = P(B|A)P(A)/P(B)",
        "Σ = ∫ f(x) dx",
    ]),
    "bg_graph_on": "1",
    "bg_graph_count": "3",            # how many graphs float behind the page
    # Which shapes to draw from — any of: tree, mesh, path, ring
    "bg_graph_kinds": "tree,mesh,path,ring",

    # --- master discoveries ---
    # Practice notes: things learned the hard way while building real
    # systems, written down so they're shared rather than re-learned. Same
    # JSON-list shape as social_links and music_playlist, each entry:
    #   {"title": "...", "context": "...", "body": "...", "tag": "..."}
    "discoveries_title": "Master Discoveries",
    "discoveries_note": (
        "Practices I picked up building real systems — the kind of thing that "
        "only shows up once something breaks in production."
    ),
    "discoveries": json.dumps([
        {
            "tag": "Debugging",
            "title": "Reproduce it before you fix it",
            "context": "Embedded firmware, intermittent sensor dropouts",
            "body": (
                "A bug you can't trigger on demand isn't fixed when it stops "
                "appearing — it's just hiding. Getting a reliable reproduction "
                "usually takes longer than the fix, and it is the only thing "
                "that tells you afterwards whether the fix worked."
            ),
        },
        {
            "tag": "Architecture",
            "title": "Put the truth on the server",
            "context": "Multiplayer features, shared counters, anything scored",
            "body": (
                "If the browser owns a number, every visitor sees a different "
                "one and anyone can change theirs from the console. Keep the "
                "state server-side and let the client ease towards it — you get "
                "one truth and it still feels instant."
            ),
        },
        {
            "tag": "Frontend",
            "title": "Test the gesture, not the shortcut",
            "context": "A page that couldn't be scrolled for two releases",
            "body": (
                "scrollIntoView, full-page screenshots and window.scrollBy all "
                "work fine on a page that a real wheel or finger cannot scroll. "
                "Drive the actual input in tests, or you verify something the "
                "user never does."
            ),
        },
    ]),

    # --- music playlist ---
    # A JSON list, same shape as social_links so it needs no backend change to
    # grow: {"title": "...", "url": "https://youtube.com/watch?v=..."}
    # The title is optional — the player falls back to the video's own title,
    # which the YouTube player reports once a track loads.
    "music_playlist": json.dumps([]),
    "music_title": "Playlist",
    "music_note": "Music I build to. Plays right here — nothing leaves the page.",

    # --- integrations ---
    "github_username": "dalerivatives",

    # --- SEO / link previews ---
    "site_url": "",
    "site_title": "Engr. Johndaleverth Pastorfide Echanova",
    "meta_description": (
        "Johndaleverth “Dale” Echanova — Computer Engineer and full-stack "
        "developer building web apps, embedded prototypes, and computer-vision systems "
        "from Marinduque, Philippines."
    ),

    # --- uploaded files (set by the editor's upload button) ---
    "resume_url": "",
    "favicon_url": "",
}


def seed_settings(db: Session):
    """Inserts any setting key that doesn't exist yet, leaving existing values
    alone. Runs on every startup, so a key added in a later version appears
    with its default instead of coming back empty."""
    existing = {s.key for s in db.query(models.Setting).all()}
    added = False
    for key, value in DEFAULT_SETTINGS.items():
        if key not in existing:
            db.add(models.Setting(key=key, value=value))
            added = True
    if added:
        db.commit()
    _expand_middle_initial(db)


def _expand_middle_initial(db: Session):
    """Write the owner's middle name out in full, everywhere it is stored.

    The name is shown in more than one place and each place is a separate
    row in the settings table: the browser tab and search result come from
    `site_title`, and the big name on the page itself comes from
    `hero_name_rest`. Fixing only the first left the second still reading
    "P." on the page — which is exactly what happened.

    So this walks every setting rather than one named key. The two patterns
    are narrow enough to be safe anywhere: "P." only ever stands for
    "Pastorfide" when it sits between those names or directly before the
    surname. Once expanded, nothing matches any more, so this is a no-op on
    every later start and cannot fight an edit made in the editor.
    """
    patterns = (
        (re.compile(r"\bJohndaleverth\s+P\.\s+Echanova\b"), "Johndaleverth Pastorfide Echanova"),
        (re.compile(r"\bP\.\s+Echanova\b"), "Pastorfide Echanova"),
        # "Engr.Johndaleverth" -> "Engr. Johndaleverth": a missing space
        # after the abbreviation, from the same typing.
        (re.compile(r"\bEngr\.(?=\S)"), "Engr. "),
    )
    changed = False
    for row in db.query(models.Setting).all():
        value = row.value or ""
        # Private rows (the stored icon, flags) hold data, not wording.
        if not value or row.key.startswith("_"):
            continue
        updated = value
        for pattern, replacement in patterns:
            updated = pattern.sub(replacement, updated)
        if updated != value:
            row.value = updated
            changed = True
    if changed:
        db.commit()


# Private settings start with "_" and are never sent to the browser.
SEEDED_FLAG = "_meta_seeded"


def seed_if_empty(db: Session):
    seed_settings(db)
    if db.get(models.Setting, SEEDED_FLAG):
        return
    # A database that already holds content (every site running before this
    # flag existed) is marked as seeded without touching anything, so a
    # section its owner emptied stays empty.
    if db.query(models.Category).first() is not None:
        db.add(models.Setting(key=SEEDED_FLAG, value="1"))
        db.commit()
        return
    for section, categories in SEED_DATA.items():
        for cat_index, cat in enumerate(categories):
            category = models.Category(section=section, name=cat["name"], sort_order=cat_index)
            db.add(category)
            db.flush()  # get category.id
            for item_index, item in enumerate(cat["items"]):
                db.add(
                    models.Item(
                        category_id=category.id,
                        title=item["title"],
                        description=item.get("description", ""),
                        tools=item.get("tools", ""),
                        media_type="",
                        media_url="",
                        sort_order=item_index,
                    )
                )
    db.add(models.Setting(key=SEEDED_FLAG, value="1"))
    db.commit()
