import asyncio
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import random
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import github, linkpreview, models, schemas, seed
from .database import IS_SQLITE, Base, SessionLocal, engine, get_db

# ---------------------------------------------------------------------------
# Paths / config
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# The old default was the literal string "changeme123", printed in this repo's
# own README. A public deployment that never set ADMIN_KEY was therefore open to
# anyone who read the README: /editor.html is a public URL and the key was the
# only thing guarding it. There is no safe well-known default, so when the
# variable is missing the server invents a random one instead. That fails
# CLOSED - nobody can sign in, including you, until ADMIN_KEY is set for real -
# which is the correct way round for a secret.
_ADMIN_KEY_ENV = os.environ.get("ADMIN_KEY", "").strip()
ADMIN_KEY_IS_SET = bool(_ADMIN_KEY_ENV) and _ADMIN_KEY_ENV != "changeme123"
ADMIN_KEY = _ADMIN_KEY_ENV if ADMIN_KEY_IS_SET else secrets.token_urlsafe(32)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_MEDIA_PREFIXES = ("image/", "video/")

if not ADMIN_KEY_IS_SET:
    print(
        "\n[portfolio-backend] ADMIN_KEY is not set"
        + (" (it is still the published default 'changeme123')." if _ADMIN_KEY_ENV else ".")
        + "\n"
        "A random one-off key was generated for this process, so the editor is\n"
        "locked and cannot be signed into until you set the variable yourself.\n"
        "On Render: Dashboard -> your service -> Environment -> Add Environment\n"
        "Variable -> ADMIN_KEY -> a long random secret -> Save, which redeploys.\n"
    )

# ---------------------------------------------------------------------------
# Live reload (development only)
#
# `uvicorn --reload` restarts the SERVER when a .py file changes, but it can't
# touch the browser — and most of the work here is HTML, CSS and JS, which
# uvicorn doesn't watch at all. This endpoint reports a fingerprint of every
# static file's size and mtime; the page polls it and reloads itself the
# moment the number changes. That covers both halves: edit a template and the
# tab refreshes, edit a route and uvicorn restarts, which also changes the
# fingerprint, so the tab refreshes for that too.
#
# OFF unless DEV=1. A public deployment must not have every visitor polling a
# directory listing twice a second, and the reload script isn't even served
# into the page when it's off.
# ---------------------------------------------------------------------------
DEV_MODE = os.environ.get("DEV", "").strip().lower() in ("1", "true", "yes", "on")

if DEV_MODE:
    print("[portfolio-backend] DEV=1 — live reload is on; the browser will refresh on file changes.")


def _static_fingerprint() -> str:
    """A cheap hash of every static file's path, size and mtime.

    Hashing the metadata rather than the contents keeps this to a stat() per
    file, so polling it costs almost nothing even on a large static folder.
    """
    digest = hashlib.sha1()
    for path in sorted(STATIC_DIR.rglob("*")):
        if path.is_file():
            try:
                stat = path.stat()
            except OSError:
                continue
            digest.update(str(path.relative_to(STATIC_DIR)).encode())
            digest.update(str(int(stat.st_mtime)).encode())
            digest.update(str(stat.st_size).encode())
    return digest.hexdigest()[:16]


Base.metadata.create_all(bind=engine)


def _add_missing_columns():
    """A minimal migration: adds columns this version expects to tables that
    already exist.

    `create_all` only ever CREATES tables — it never alters one. So a new
    table arrives on its own, but a new COLUMN on an existing table does not,
    and the first query against it dies with "no such column". That is exactly
    what upgrading in place looks like: the site loads, and then the chat 500s.

    Alembic would be the grown-up answer, but it is a dependency and a
    migrations folder for what is, so far, a handful of ADD COLUMNs. This does
    the same job for this app: read what's there, add what's missing, leave
    existing data alone.

    Dialect-aware on both halves. It used to read the schema with
    `PRAGMA table_info`, which is SQLite-only — on Postgres that raises, the
    exception was swallowed, and every migration silently did nothing. It also
    emitted `BOOLEAN DEFAULT 0`, which Postgres rejects outright. SQLAlchemy's
    inspector reads either dialect, and the types below are written per
    dialect. Every column added here MUST be nullable or have a default,
    because SQLite cannot add a NOT NULL column without one.
    """
    from sqlalchemy import inspect as sa_inspect

    postgres = not IS_SQLITE
    bool_false = "BOOLEAN DEFAULT FALSE NOT NULL" if postgres else "BOOLEAN DEFAULT 0 NOT NULL"
    float_zero = "DOUBLE PRECISION DEFAULT 0 NOT NULL" if postgres else "FLOAT DEFAULT 0 NOT NULL"
    ts = "TIMESTAMPTZ" if postgres else "DATETIME"

    wanted = {
        "chat_names": [
            ("verified_at", ts),
            ("hit_since_respawn", bool_false),
            ("damage_dealt", float_zero),
            ("blows", "INTEGER DEFAULT 0 NOT NULL"),
            ("crowns", "INTEGER DEFAULT 0 NOT NULL"),
        ],
        "robot_state": [
            ("last_destroyer", "VARCHAR(40) DEFAULT ''"),
            ("last_destroyer_damage", "DOUBLE PRECISION DEFAULT 0" if postgres else "FLOAT DEFAULT 0"),
            ("last_destroyer_blows", "INTEGER DEFAULT 0"),
        ],
    }

    try:
        inspector = sa_inspect(engine)
        present = set(inspector.get_table_names())
    except Exception as exc:
        print(f"[portfolio-backend] could not inspect the database: {exc}")
        return

    with engine.begin() as conn:
        for table, columns in wanted.items():
            if table not in present:
                continue                  # create_all will have made it correctly
            existing = {col["name"] for col in inspector.get_columns(table)}
            for name, ddl in columns:
                if name in existing:
                    continue
                try:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
                    print(f"[portfolio-backend] migrated: added {table}.{name}")
                except Exception as exc:
                    print(f"[portfolio-backend] could not add {table}.{name}: {exc}")


_add_missing_columns()
with SessionLocal() as _db:
    seed.seed_if_empty(_db)

app = FastAPI(title="Portfolio Content API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Login sessions
#
# The editor used to send the raw ADMIN_KEY on every single request, which
# means the actual password sat in browser storage and travelled with every
# call. Now it's sent exactly once, to /api/auth/login, which trades it for a
# signed token that expires. The token is just base64(payload).signature, with
# the signature an HMAC over the payload keyed by ADMIN_KEY — so no database
# table and no extra dependency, but a stolen token still can't be forged or
# used forever. The raw-key header is still accepted as a fallback so any
# older editor copy keeps working.
# ---------------------------------------------------------------------------
SESSION_TTL_SECONDS = 12 * 60 * 60  # 12 hours


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload_b64: str) -> str:
    digest = hmac.new(ADMIN_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return _b64e(digest)


def issue_session_token() -> tuple[str, int]:
    expires_at = int(time.time()) + SESSION_TTL_SECONDS
    payload_b64 = _b64e(json.dumps({"exp": expires_at}).encode())
    return f"{payload_b64}.{_sign(payload_b64)}", expires_at


def _session_token_valid(token: str) -> bool:
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError:
        return False
    if not hmac.compare_digest(signature, _sign(payload_b64)):
        return False
    try:
        payload = json.loads(_b64d(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return False
    return int(payload.get("exp", 0)) > time.time()


def require_admin(
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    authorization: Optional[str] = Header(None),
):
    if authorization and authorization.lower().startswith("bearer "):
        if _session_token_valid(authorization[7:].strip()):
            return True
        raise HTTPException(status_code=401, detail="Session expired - please sign in again")
    if x_admin_key and hmac.compare_digest(x_admin_key, ADMIN_KEY):
        return True
    raise HTTPException(status_code=401, detail="Invalid or missing admin key")


def valid_section(section: str) -> str:
    if section not in models.SECTIONS:
        raise HTTPException(status_code=400, detail=f"section must be one of {models.SECTIONS}")
    return section


# ---------------------------------------------------------------------------
# Public read endpoints
# ---------------------------------------------------------------------------
@app.get("/api/dev/version")
def dev_version():
    """The live-reload heartbeat. Always present so the client gets a clean
    `enabled: false` rather than a 404 to special-case, but it only reports a
    changing fingerprint when DEV=1."""
    if not DEV_MODE:
        return {"enabled": False, "version": "off"}
    return {"enabled": True, "version": _static_fingerprint(), "pid": os.getpid()}


@app.get("/api/health")
def health():
    """Liveness only. Returns a constant and opens no database connection, so
    it stays cheap enough to poll every few minutes. See /api/health/db for the
    one a keep-alive monitor should actually use."""
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db(db: Session = Depends(get_db)):
    """Liveness AND a deliberate touch of the database.

    This exists because of a trap in the free-tier stack. Supabase pauses a
    Free-plan project after roughly 7 days of low activity, and a monitor
    pinging /api/health would never prevent it: that endpoint returns a
    constant and never opens a connection. So an uptime pinger could keep the
    web service awake for months while the database quietly paused underneath
    it — and the site would break on the next real visit, with the web host
    reporting perfect uptime the whole time.

    Point keep-alive monitors HERE. One trivial SELECT is enough to count as
    activity on both halves of the stack.
    """
    from sqlalchemy import text

    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - a monitor wants the reason, not a 500
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": "unreachable", "detail": str(exc)[:200]},
        )
    return {"status": "ok", "db": "ok"}


@app.get("/api/admin/check", dependencies=[Depends(require_admin)])
def admin_check():
    """Cheap endpoint the editor UI calls to verify a stored session still works."""
    return {"ok": True}


@app.post("/api/auth/login")
def login(payload: schemas.LoginIn):
    """Trades the admin key for an expiring session token (see issue_session_token)."""
    if not hmac.compare_digest(payload.key, ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Wrong admin key")
    token, expires_at = issue_session_token()
    return {"token": token, "expires_at": expires_at}


# ---------------------------------------------------------------------------
# Live presence ("N Viewers Online")
#
# Each open tab POSTs a heartbeat every ~20s with a random id it made up.
# A viewer counts as online if their last heartbeat was within PRESENCE_TTL.
# Deliberately in-memory: it's a live-right-now number, nothing worth
# persisting, and it costs no database writes. The trade-off is that the count
# is per server process — it resets on restart, and if this is ever run with
# multiple workers each one counts only its own viewers. For a personal site on
# a single free-tier instance that's the right trade; if it ever runs on
# several workers, move _presence into Redis and the rest of this stays put.
# ---------------------------------------------------------------------------
PRESENCE_TTL_SECONDS = 45

# viewer_id -> (last_seen, claimed_name_or_empty). The name is carried so the
# badge can show the FACES of the people here, not just a number. Only names
# already claimed in world chat appear — that is public information on this
# site by definition, and a visitor who never joins is counted without ever
# being named.
_presence: dict[str, tuple[float, str]] = {}
_presence_lock = threading.Lock()

# How many faces the badge shows before it starts counting "+N".
PRESENCE_FACES = 3


def _sweep_present() -> list[tuple[float, str]]:
    """Drop the stale heartbeats and return what is left. The caller holds
    the lock; every reader needs the same expiry, so it lives in one place."""
    cutoff = time.time() - PRESENCE_TTL_SECONDS
    for viewer_id in [k for k, v in _presence.items() if v[0] < cutoff]:
        _presence.pop(viewer_id, None)
    return list(_presence.values())


def _presence_state() -> dict:
    with _presence_lock:
        rows = _sweep_present()

    # Most recently seen first, so the faces shown are the people who are
    # actually active rather than whoever happened to load the page first.
    named = sorted(
        ((seen, name) for seen, name in rows if name),
        key=lambda r: r[0],
        reverse=True,
    )

    # One face per PERSON, not per tab: someone with the site open twice
    # should not appear twice in the stack.
    faces: list[str] = []
    for _, name in named:
        if name not in faces:
            faces.append(name)
        if len(faces) >= PRESENCE_FACES:
            break

    return {"online": len(rows), "faces": faces, "named": len({n for _, n in named})}


@app.post("/api/presence")
def presence_ping(payload: schemas.PresenceIn):
    viewer_id = (payload.viewer_id or "").strip()[:64]
    name = (payload.name or "").strip()[:40]
    if viewer_id:
        with _presence_lock:
            _presence[viewer_id] = (time.time(), name)
    return _presence_state()


@app.get("/api/presence")
def presence_count():
    return _presence_state()


# ---------------------------------------------------------------------------
# Site settings — every editable piece of site text/config
# ---------------------------------------------------------------------------
@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    """Public: the site reads this on load to fill in its own text. Defaults
    are merged in so a key added in a newer version still answers with
    something sensible before it's ever been saved."""
    stored = {s.key: (s.value or "") for s in db.query(models.Setting).all()}
    return {**seed.DEFAULT_SETTINGS, **stored}


@app.put("/api/settings", dependencies=[Depends(require_admin)])
def update_settings(payload: dict, db: Session = Depends(get_db)):
    """Admin: save any subset of settings. Unknown keys are ignored rather
    than rejected, so an older editor can't write junk into the table."""
    for key, value in payload.items():
        if key not in seed.DEFAULT_SETTINGS:
            continue
        setting = db.get(models.Setting, key)
        if setting:
            setting.value = "" if value is None else str(value)
        else:
            db.add(models.Setting(key=key, value="" if value is None else str(value)))
    db.commit()
    stored = {s.key: (s.value or "") for s in db.query(models.Setting).all()}
    return {**seed.DEFAULT_SETTINGS, **stored}


@app.post("/api/settings/upload", dependencies=[Depends(require_admin)])
def upload_setting_file(
    key: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Admin: upload a file and store its URL in the matching setting,
    replacing whatever was there before."""
    if key not in ("resume_url",):
        raise HTTPException(status_code=400, detail="That setting doesn't take a file")

    content_type = file.content_type or ""
    if content_type != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="The resume must be a PDF")

    _, media_url = _save_upload(file, allow_pdf=True)

    setting = db.get(models.Setting, key)
    if setting:
        _delete_uploaded_file(setting.value)
        setting.value = media_url
    else:
        db.add(models.Setting(key=key, value=media_url))
    db.commit()
    return {"key": key, "value": media_url}


# ---------------------------------------------------------------------------
# World Chat
#
# Genuinely public: any visitor picks a display name and posts, and everyone
# else sees it. There are no accounts, so the name is self-assigned and not
# verified — that's the nature of a world chat, not an oversight.
#
# Because the write endpoint is open to the internet, it is bounded rather
# than trusted: length caps on both fields, a per-IP cooldown plus hourly
# cap, and a total row cap that trims the oldest messages so the table can't
# grow without limit. The owner can delete anything from the editor.
# ---------------------------------------------------------------------------
CHAT_MAX_NAME = 40
CHAT_MAX_BODY = 500
# Per DEVICE, not per IP. An IP is not a person: a house, a school and every
# phone on the same carrier share one, so a per-IP budget is really a budget
# split between strangers. These numbers describe how fast one human types,
# so they belong to one browser.
CHAT_MIN_SECONDS_BETWEEN = 3        # per device, stops hammering
CHAT_MAX_PER_HOUR = 30              # per device

# The IP ceiling stays, but only as a backstop against one machine clearing
# its storage over and over to mint fresh device ids. It is set high enough
# that a full household chatting normally will never reach it.
CHAT_MAX_PER_HOUR_PER_IP = 300
CHAT_KEEP_ROWS = 500                # oldest trimmed beyond this

_chat_history: dict[str, list[float]] = {}
_chat_ip_history: dict[str, list[float]] = {}
_chat_lock = threading.Lock()


def _prune(store: dict, now: float):
    if len(store) > 5000:
        for k in [k for k, v in store.items() if not v or now - v[-1] > 3600]:
            store.pop(k, None)


def _chat_rate_limit(client_ip: str, device_id: str):
    now = time.time()
    # Fall back to the IP only when there is no device id to key on, so a
    # request that skips it can't slip past the limiter entirely.
    key = device_id or f"ip:{client_ip}"
    with _chat_lock:
        hits = [t for t in _chat_history.get(key, []) if now - t < 3600]
        if hits and now - hits[-1] < CHAT_MIN_SECONDS_BETWEEN:
            raise HTTPException(status_code=429, detail="Slow down a moment before sending again.")
        if len(hits) >= CHAT_MAX_PER_HOUR:
            raise HTTPException(status_code=429, detail="That's a lot of messages — try again later.")

        ip_hits = [t for t in _chat_ip_history.get(client_ip, []) if now - t < 3600]
        if client_ip != "unknown" and len(ip_hits) >= CHAT_MAX_PER_HOUR_PER_IP:
            raise HTTPException(status_code=429, detail="That's a lot of messages — try again later.")

        hits.append(now)
        _chat_history[key] = hits
        ip_hits.append(now)
        _chat_ip_history[client_ip] = ip_hits
        # keep the tracking dicts from growing forever on a long-lived process
        _prune(_chat_history, now)
        _prune(_chat_ip_history, now)


CHAT_RETENTION_HOURS = 24


def _expire_old_chat(db: Session):
    """Resets the room every 24 hours — messages AND the names that posted
    them. Expiring only the messages would leave a permanent registry of
    nicknames behind an empty log, and would mean a name claimed once could
    never be used by anyone again.

    Called on read and on post rather than from a scheduler: this app has no
    background worker, and the cost is two indexed DELETEs on traffic that is
    already touching the table.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=CHAT_RETENTION_HOURS)
    deleted = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    deleted += (
        db.query(models.ChatName)
        .filter(models.ChatName.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()


# ---------------------------------------------------------------------------
# Who is this request actually from?
#
# `request.client.host` is the address of whatever opened the TCP connection.
# In front of this app that is Render's load balancer, not the visitor, so on
# the deployed site EVERY request reports the same address. uvicorn can undo
# that from X-Forwarded-For, but only for proxies listed in
# `--forwarded-allow-ips`, which defaults to 127.0.0.1 — and Render's proxy is
# not 127.0.0.1. So the header was being discarded and the whole world shared
# one apparent IP.
#
# Reading the headers here rather than fiddling with uvicorn flags keeps the
# behaviour with the code that depends on it, and works the same whether the
# start command is Render's, the Procfile's, or someone's local `uvicorn`.
#
# Cloudflare sets CF-Connecting-IP itself and strips any copy the client sent,
# so it is the trustworthy one when present. X-Forwarded-For is a fallback and
# its leftmost entry IS client-settable — which is fine, because after this
# change the value is only ever used for rate limiting. Nothing about identity
# or authorship depends on it, so a forged header buys an attacker nothing
# they could not get by clearing their browser storage.
# ---------------------------------------------------------------------------
def _client_ip(request: Request) -> str:
    cf = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf:
        return cf[:64]
    xff = (request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first[:64]
    return ((request.client.host if request.client else "") or "unknown")[:64]


# ---------------------------------------------------------------------------
# Name claims — ONE NAME PER DEVICE. Deliberately not per IP.
#
# There are no accounts, so a name is held by whoever claimed it, keyed on a
# random `device_id` the browser stores. Enforcing it on the SERVER rather
# than in the browser is the whole point: a client-side lock is one devtools
# command away, and the name is what every other viewer reads a message by.
#
# There used to be a second rule: one name per IP as well, so that someone who
# cleared their storage could retype their name and carry on. It had to go.
# An IP is not a person — a household, a school, an office and every phone
# behind a carrier NAT all share one — so that rule told a second device on the
# same Wi-Fi it was already chatting as someone else. Combined with the proxy
# problem above it was worse still: with every visitor reporting the same
# address, the first person in the world to claim a name locked out everyone
# who came after.
#
# Devices are independent now. `ip` is still recorded, for rate limiting and
# for looking at abuse after the fact, but it decides nothing about identity.
# ---------------------------------------------------------------------------
def _device_claim(db: Session, device_id: str):
    if not device_id:
        return None
    return db.query(models.ChatName).filter(models.ChatName.device_id == device_id).first()


def _claim_payload(row, mine: bool = True):
    if not row:
        return {"name": "", "claimed": False}
    created = row.created_at
    if created is not None and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    expires_in = 0
    if created is not None:
        gone = created + timedelta(hours=CHAT_RETENTION_HOURS)
        expires_in = max(0, int((gone - datetime.now(timezone.utc)).total_seconds()))
    return {
        "name": row.name,
        "claimed": True,
        "mine": mine,
        "expires_in": expires_in,
        # Has this person actually destroyed UNIT-01 this session?
        "verified": row.verified_at is not None,
    }


@app.get("/api/chat/name")
def get_chat_name(request: Request, device_id: str = "", db: Session = Depends(get_db)):
    """What name, if any, this device already holds. The browser calls this on
    load so an expired claim clears the stale name it had stored."""
    _expire_old_chat(db)
    client_ip = _client_ip(request)
    device_id = (device_id or "").strip()[:64]

    mine = _device_claim(db, device_id)
    if mine:
        return _claim_payload(mine)

    # Nothing held by THIS device means nothing to report, whatever other
    # devices on the same connection are doing. Each browser answers for
    # itself and nobody else.
    return {"name": "", "claimed": False}


@app.post("/api/chat/name")
def claim_chat_name(payload: schemas.ChatNameIn, request: Request, db: Session = Depends(get_db)):
    name = (payload.name or "").strip()[:CHAT_MAX_NAME]
    device_id = (payload.device_id or "").strip()[:64]
    if not name:
        raise HTTPException(status_code=400, detail="Type a name first.")
    if not device_id:
        raise HTTPException(status_code=400, detail="Missing device id.")

    _expire_old_chat(db)
    client_ip = _client_ip(request)
    key = name.lower()

    # Already holding one? Hand back the same name rather than erroring — a
    # reload or a second tab must not look like a failure.
    mine = _device_claim(db, device_id)
    if mine:
        if mine.name_key == key:
            return _claim_payload(mine)
        raise HTTPException(
            status_code=409,
            detail=f"This device is already chatting as “{mine.name}”. "
                   f"Names reset when the chat clears.",
        )

    # The only thing left that can refuse a name is the name itself already
    # being in use — which is not about networks or devices at all. Two people
    # called "Dale" in one room would make every message ambiguous, and the
    # name is the only thing readers have to tell them apart.
    taken = db.get(models.ChatName, key)
    if taken:
        raise HTTPException(
            status_code=409,
            detail=f"“{taken.name}” is taken right now — try another name, "
                   f"or add something to it.",
        )

    row = models.ChatName(name_key=key, name=name, device_id=device_id, ip=client_ip)
    db.add(row)
    try:
        db.commit()
    except Exception:
        # Two people claiming the same name in the same instant: the loser
        # gets the same answer they would have got a moment earlier.
        db.rollback()
        raise HTTPException(status_code=409, detail="Someone just took that name — pick another.")
    db.refresh(row)
    return _claim_payload(row)


@app.get("/api/chat", response_model=list[schemas.ChatMessageOut])
def list_chat(limit: int = 60, db: Session = Depends(get_db)):
    """Newest messages, returned oldest-first so the page can just append."""
    _expire_old_chat(db)
    limit = max(1, min(limit, 200))
    rows = (
        db.query(models.ChatMessage)
        .order_by(models.ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


@app.post("/api/chat", response_model=schemas.ChatMessageOut)
def post_chat(payload: schemas.ChatMessageIn, request: Request, db: Session = Depends(get_db)):
    name = (payload.name or "").strip()[:CHAT_MAX_NAME]
    body = (payload.body or "").strip()[:CHAT_MAX_BODY]
    device_id = (payload.device_id or "").strip()[:64]
    if not name:
        raise HTTPException(status_code=400, detail="Pick a name first.")
    if not body:
        raise HTTPException(status_code=400, detail="Type a message.")

    client_ip = _client_ip(request)
    _expire_old_chat(db)

    # The name on the message must be one this device actually claimed —
    # otherwise anyone could post as anyone by editing one fetch call.
    claim = db.get(models.ChatName, name.lower())
    if not claim:
        raise HTTPException(status_code=409, detail="That name has expired — pick a name again.")
    if claim.device_id != device_id:
        raise HTTPException(status_code=403, detail="That name belongs to someone else.")
    if claim.verified_at is None:
        # The captcha is the point of the robot; a composer that merely LOOKS
        # locked is decoration, since the endpoint is one fetch call away.
        raise HTTPException(status_code=403, detail="Destroy UNIT-01 first — that's how you prove you're not a robot.")
    name = claim.name          # post under the name exactly as it was claimed

    _chat_rate_limit(client_ip, device_id)

    message = models.ChatMessage(name=name, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)

    # trim the backlog so an open endpoint can't fill the disk
    total = db.query(models.ChatMessage).count()
    if total > CHAT_KEEP_ROWS:
        cutoff = (
            db.query(models.ChatMessage.id)
            .order_by(models.ChatMessage.id.desc())
            .offset(CHAT_KEEP_ROWS)
            .first()
        )
        if cutoff:
            db.query(models.ChatMessage).filter(models.ChatMessage.id <= cutoff[0]).delete()
            db.commit()

    return message


@app.delete("/api/chat/{message_id}", dependencies=[Depends(require_admin)])
def delete_chat(message_id: int, db: Session = Depends(get_db)):
    message = db.get(models.ChatMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(message)
    db.commit()
    return {"deleted": True}


@app.delete("/api/chat", dependencies=[Depends(require_admin)])
def clear_chat(db: Session = Depends(get_db)):
    """Wipes the room by hand, the same way the 24-hour expiry does it
    automatically — messages AND name claims. Clearing only the messages
    would leave every name still held, so nobody could re-join under the
    name they had, which is the opposite of a reset."""
    deleted = db.query(models.ChatMessage).delete()
    names = db.query(models.ChatName).delete()
    db.commit()
    return {"deleted": deleted, "names_released": names}


# ---------------------------------------------------------------------------
# The World Chat robot
#
# One robot, shared by everyone on the page. HP is a percentage and lives on
# the SERVER: taps are only requests to do damage, never the damage itself,
# so a hundred people tapping at once still see one consistent number and
# nobody can knock it out by editing their own copy.
#
# At 0% it explodes and stays dead for RESPAWN_SECONDS, then comes back at
# full HP. Death is stored as a timestamp rather than a timer so it resolves
# correctly no matter which request happens to notice it first.
# ---------------------------------------------------------------------------
ROBOT_RESPAWN_SECONDS = 10
ROBOT_MIN_DAMAGE = 2.0
ROBOT_MAX_DAMAGE = 5.0
# Per device. This is a tap cadence for one player's finger, not an abuse
# control, so keying it on an IP meant two people on the same Wi-Fi silently
# ate each other's taps. The endpoint already refuses a hit whose claimed name
# does not belong to the device id sent with it, and names are unique, so a
# device id cannot be rotated to tap faster without also claiming a new name.
ROBOT_MIN_SECONDS_BETWEEN_HITS = 0.12   # ~8 taps/sec, fast but not a script
_robot_hits: dict[str, float] = {}
_robot_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Live tap feed
#
# So that everyone watching sees everyone else's taps as they land — the
# tapper's name and damage floating up at the exact spot they hit, and the
# robot reacting for all of them, not just the person who tapped.
#
# Events are an in-memory ring buffer, not a table: they're worth ~2 seconds
# each and writing them to disk would be pure cost. Clients subscribe with
# Server-Sent Events (one-way server→client, plain HTTP, no extra
# dependency and no websocket handshake to babysit) and pass the last id
# they saw, so a brief disconnect replays what they missed instead of
# dropping it. There's a polling fallback on the same buffer for anything
# that can't hold an SSE connection open.
# ---------------------------------------------------------------------------
ROBOT_EVENT_BUFFER = 60
_robot_events: list[dict] = []
_robot_event_seq = 0


def _push_robot_event(event: dict):
    global _robot_event_seq
    with _robot_lock:
        _robot_event_seq += 1
        event["id"] = _robot_event_seq
        event["ts"] = time.time()
        _robot_events.append(event)
        if len(_robot_events) > ROBOT_EVENT_BUFFER:
            del _robot_events[:-ROBOT_EVENT_BUFFER]


def _robot_events_since(since: int) -> list[dict]:
    with _robot_lock:
        return [e for e in _robot_events if e["id"] > since]


def _get_robot(db: Session) -> models.RobotState:
    robot = db.get(models.RobotState, 1)
    if not robot:
        robot = models.RobotState(id=1, hp=100.0, dead_until=0.0, kills=0, total_hits=0)
        db.add(robot)
        db.commit()
        db.refresh(robot)
    return robot


def _robot_payload(robot: models.RobotState) -> dict:
    now = time.time()
    dead = robot.dead_until > now
    return {
        "hp": round(robot.hp, 1),
        "dead": dead,
        "respawn_in": round(max(0.0, robot.dead_until - now), 1) if dead else 0.0,
        "kills": robot.kills,
        "total_hits": robot.total_hits,
        "last_hit_by": robot.last_hit_by or "",
    }


def _resolve_respawn(db: Session, robot: models.RobotState) -> models.RobotState:
    """Brings the robot back once its death timestamp has passed."""
    if robot.dead_until and robot.dead_until <= time.time():
        robot.hp = 100.0
        robot.dead_until = 0.0
        db.commit()
    return robot


@app.get("/api/robot")
def robot_state(db: Session = Depends(get_db)):
    robot = _resolve_respawn(db, _get_robot(db))
    return _robot_payload(robot)


@app.post("/api/robot/hit")
def robot_hit(payload: schemas.RobotHitIn, request: Request, db: Session = Depends(get_db)):
    client_ip = _client_ip(request)

    # You have to say who you are before you can take a swing. The robot IS
    # the captcha, and a hit that arrives with no claimed name has nothing to
    # verify — it would also let the "name first" sequence be skipped entirely
    # by posting straight to this endpoint. The name that lands on the robot
    # is the claimed one, so the floating tag can't say someone else.
    _expire_old_chat(db)
    claimed = (payload.name or "").strip()[:40]
    claim = db.get(models.ChatName, claimed.lower()) if claimed else None
    if not claim:
        raise HTTPException(status_code=403, detail="Enter your name before attacking UNIT-01.")
    if claim.device_id != (payload.device_id or "").strip()[:64]:
        raise HTTPException(status_code=403, detail="That name belongs to someone else.")

    now = time.time()
    with _robot_lock:
        tap_key = (payload.device_id or "").strip()[:64] or f"ip:{client_ip}"
        last = _robot_hits.get(tap_key, 0.0)
        if now - last < ROBOT_MIN_SECONDS_BETWEEN_HITS:
            # Not an error worth interrupting the game for — just report the
            # current state so the tap is quietly ignored.
            robot = _resolve_respawn(db, _get_robot(db))
            return {**_robot_payload(robot), "damage": 0.0, "throttled": True}
        _robot_hits[tap_key] = now
        if len(_robot_hits) > 5000:
            for k in [k for k, t in _robot_hits.items() if now - t > 300]:
                _robot_hits.pop(k, None)

    robot = _resolve_respawn(db, _get_robot(db))
    if robot.dead_until > now:
        return {**_robot_payload(robot), "damage": 0.0, "throttled": False}

    rolled = round(random.uniform(ROBOT_MIN_DAMAGE, ROBOT_MAX_DAMAGE), 1)
    # Only count what there was left to take. A blow rolling 4.6% against 1.2%
    # of remaining HP does 1.2% of damage, not 4.6% — otherwise a round's
    # winning total reads past 100%, which is nonsense on a board measuring
    # how much of ONE robot you destroyed.
    #
    # `applied` is deliberately NOT rounded before it is subtracted. Rounding
    # it first left a floating-point residue behind — hp ended up at 4.4e-17,
    # which is not `<= 0`, so the robot displayed 0% and could never die: the
    # next blow could only take min(roll, 4.4e-17), which rounds to 0.0, and
    # the fight ran forever. The residue is snapped instead, once, here.
    applied = min(rolled, robot.hp)
    robot.hp = max(0.0, robot.hp - applied)
    if robot.hp < 1e-6:
        robot.hp = 0.0
    damage = round(applied, 1)          # what the floating tag shows
    robot.total_hits += 1
    name = claim.name          # the claimed spelling, never the posted one
    robot.last_hit_by = name

    claim.hit_since_respawn = True
    claim.damage_dealt = (claim.damage_dealt or 0.0) + applied
    claim.blows = (claim.blows or 0) + 1

    destroyed = robot.hp <= 0
    if destroyed:
        robot.hp = 0.0
        robot.kills += 1
        robot.dead_until = now + ROBOT_RESPAWN_SECONDS

        # The round is over. Two things happen, in this order:
        #
        # 1. CROWN THE DESTROYER — whoever dealt the most damage during this
        #    life, not whoever landed the last blow. The final hit is luck;
        #    the damage before it is the work.
        # 2. WIPE THE ROUND — every per-life tally back to zero, so the next
        #    life starts even and the board is always about the fight in
        #    front of you rather than a running total that can't be caught.
        stamp = datetime.now(timezone.utc)
        fighters = (
            db.query(models.ChatName)
            .filter(models.ChatName.damage_dealt > 0)
            .order_by(models.ChatName.damage_dealt.desc())
            .all()
        )
        if fighters:
            champion = fighters[0]
            robot.last_destroyer = champion.name
            robot.last_destroyer_damage = round(champion.damage_dealt or 0.0, 1)
            robot.last_destroyer_blows = champion.blows or 0
            champion.crowns = (champion.crowns or 0) + 1

        # Everyone who landed a blow during this life helped destroy it, so
        # they all pass the captcha. Crediting only the killing blow would
        # lock out anyone beaten to the last hit every time, which is a
        # miserable way to fail a captcha.
        for row in db.query(models.ChatName).filter(models.ChatName.hit_since_respawn.is_(True)).all():
            if row.verified_at is None:
                row.verified_at = stamp
            row.hit_since_respawn = False

        for row in fighters:
            row.damage_dealt = 0.0
            row.blows = 0

    db.commit()

    # Broadcast the tap so every other viewer sees it land where it landed.
    # x/y are normalised 0-1 inside the stage, so they map correctly onto
    # anyone's screen regardless of how big their robot is drawn.
    hit_event = {
        "type": "hit",
        "name": name,
        "x": max(0.0, min(1.0, float(payload.x or 0.5))),
        "y": max(0.0, min(1.0, float(payload.y or 0.5))),
        "damage": damage,
        "hp": round(robot.hp, 1),
        "destroyed": destroyed,
        "kills": robot.kills,
        "total_hits": robot.total_hits,
    }
    _push_robot_event(hit_event)
    if destroyed:
        _push_robot_event({
            "type": "destroyed",
            "name": name,
            "hp": 0.0,
            "kills": robot.kills,
            "total_hits": robot.total_hits,
            "respawn_in": ROBOT_RESPAWN_SECONDS,
        })

    # The tapper gets the event's id back so their own hit — already drawn
    # locally the instant they tapped — isn't drawn a second time when it
    # comes round on the stream.
    return {
        **_robot_payload(robot),
        "damage": damage,
        "destroyed": destroyed,
        "throttled": False,
        "event_id": hit_event["id"],
    }


ROBOT_BOARD_SIZE = 3


@app.get("/api/robot/leaderboard")
def robot_leaderboard(db: Session = Depends(get_db)):
    """Who is destroying UNIT-01 *right now*, and who destroyed the last one.

    `round` is the current life only — it empties the moment the robot dies —
    and `champion` is the name that came top of the life before this one.
    Nothing here accumulates across lives; see ChatName.damage_dealt for why.
    """
    _expire_old_chat(db)
    rows = (
        db.query(models.ChatName)
        .filter(models.ChatName.damage_dealt > 0)
        .order_by(models.ChatName.damage_dealt.desc())
        .limit(ROBOT_BOARD_SIZE)
        .all()
    )
    robot = _get_robot(db)
    champion = None
    if robot.last_destroyer:
        champion = {
            "name": robot.last_destroyer,
            "damage": round(robot.last_destroyer_damage or 0.0, 1),
            "blows": robot.last_destroyer_blows or 0,
        }
    return {
        "round": [
            {
                "name": row.name,
                "damage": round(row.damage_dealt or 0.0, 1),
                "blows": row.blows or 0,
                "crowns": row.crowns or 0,
            }
            for row in rows
        ],
        "champion": champion,
        "kills": robot.kills or 0,
    }


@app.get("/api/robot/events")
def robot_events(since: int = -1):
    """Polling fallback for anything that can't hold an SSE connection.

    `since=-1` (the default, and what a fresh client sends) means "start from
    now": it returns no backlog, only the current head. Replaying the buffer
    to someone who just arrived would fire every stored tap at once — a burst
    of floating names, recoils and clank sounds for hits that happened before
    they opened the page. A reconnecting client passes the last id it saw and
    does get the gap it missed.
    """
    if since < 0:
        return {"events": [], "latest": _robot_event_seq}
    return {"events": _robot_events_since(since), "latest": _robot_event_seq}


@app.get("/api/robot/stream")
async def robot_stream(request: Request, since: int = -1):
    """Server-Sent Events: pushes taps to every watcher as they happen.

    The generator polls the in-memory buffer rather than blocking on a queue —
    with a handful of viewers that's cheaper and much simpler than wiring up
    per-client queues, and it can't leak a queue if a client vanishes. A
    keep-alive comment goes out every 15s so proxies don't close an idle
    stream, and the loop exits as soon as the client disconnects.
    """
    async def gen():
        # See /api/robot/events: a negative `since` means "from now", so a new
        # viewer doesn't get the backlog replayed at them on connect.
        cursor = _robot_event_seq if since < 0 else since
        last_ping = time.time()
        # Tell the client where the stream starts so a reconnect can resume.
        yield f"event: hello\ndata: {json.dumps({'latest': _robot_event_seq})}\n\n"
        while True:
            if await request.is_disconnected():
                break
            events = _robot_events_since(cursor)
            if events:
                cursor = events[-1]["id"]
                for event in events:
                    yield f"id: {event['id']}\ndata: {json.dumps(event)}\n\n"
                last_ping = time.time()
            elif time.time() - last_ping > 15:
                yield ": keep-alive\n\n"
                last_ping = time.time()
            await asyncio.sleep(0.25)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",   # stops nginx-style proxies buffering it
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Link previews
#
# Turns a pasted link into a card showing the destination site's own image,
# title and description. The fetch happens here rather than in the browser
# because a browser can't read another site's Open Graph tags (CORS), and
# because the result is cached once for everyone instead of every visitor
# hammering the target site.
#
# See linkpreview.py for the SSRF protections — this endpoint takes a URL
# from the internet and makes the server fetch it, which is exactly the
# thing that has to be done carefully.
# ---------------------------------------------------------------------------
LINK_PREVIEW_TTL_HOURS = 24 * 7        # re-check a link once a week
LINK_PREVIEW_FAILED_TTL_HOURS = 6      # retry a failed one sooner


@app.get("/api/link-preview")
def link_preview(url: str, db: Session = Depends(get_db)):
    url = (url or "").strip()
    if not url or len(url) > 1000:
        raise HTTPException(status_code=400, detail="Bad URL")

    cached = db.get(models.LinkPreview, url)
    if cached and cached.fetched_at:
        fetched_at = cached.fetched_at
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        ttl = LINK_PREVIEW_TTL_HOURS if cached.ok else LINK_PREVIEW_FAILED_TTL_HOURS
        if datetime.now(timezone.utc) - fetched_at < timedelta(hours=ttl):
            return {
                "ok": cached.ok,
                "title": cached.title or "",
                "description": cached.description or "",
                "image": cached.image or "",
                "site_name": cached.site_name or "",
            }

    data = linkpreview.fetch_preview(url)

    if cached:
        cached.title = data["title"]
        cached.description = data["description"]
        cached.image = data["image"]
        cached.site_name = data["site_name"]
        cached.ok = data["ok"]
        cached.fetched_at = datetime.now(timezone.utc)
    else:
        db.add(models.LinkPreview(
            url=url,
            title=data["title"],
            description=data["description"],
            image=data["image"],
            site_name=data["site_name"],
            ok=data["ok"],
            fetched_at=datetime.now(timezone.utc),
        ))
    db.commit()
    return data


# ---------------------------------------------------------------------------
# GitHub activity
# ---------------------------------------------------------------------------
# The heatmap was fetched straight from the browser and reported "couldn't
# reach GitHub" on phones and on other people's machines. backend/github.py
# has the full account of why; the short version is that an unauthenticated
# api.github.com allows 60 requests an hour PER IP, and a phone on a carrier
# network shares its IP with a great many strangers.
#
# This endpoint is the whole fix: ONE server, ONE IP, ONE cache that every
# device reads from. A hundred visitors cost the upstreams a single request
# between them, and the answer they all get is identical.
GH_FRESH_SECONDS = 30 * 60          # serve from cache without asking upstream
GH_STALE_SECONDS = 24 * 60 * 60     # serve a stale answer rather than nothing
GH_FAIL_SECONDS = 2 * 60            # don't hammer a broken upstream

_gh_cache: dict[str, tuple[float, dict]] = {}
_gh_lock = threading.Lock()
# One asyncio lock per username, so a burst of visitors arriving together
# makes one upstream call and the rest wait for its result. Without this, a
# cold cache plus a page refresh on six devices is six identical fetches —
# which is how you get rate-limited by accident while fixing rate limiting.
_gh_inflight: dict[str, asyncio.Lock] = {}

# This endpoint makes the server fetch a URL containing a name the CALLER
# chose, which is the same shape of risk linkpreview.py exists to contain.
# The name itself is safe — github.valid_username is strict, so nothing but
# [A-Za-z0-9-] ever reaches a URL and no other host can be addressed. What is
# left is amplification: without a bound, /api/github/<a-different-name-each-
# time> turns this server into a free GitHub scraper on someone else's behalf
# and burns our own rate limit doing it.
#
# Two bounds, and neither is felt by an actual visitor, who arrives at a warm
# cache for the one account this site is about:
GH_MAX_ACCOUNTS = 12                # distinct usernames held at a time
GH_MISSES_PER_IP_HOUR = 8           # cache MISSES, not requests

_gh_misses: dict[str, list[float]] = {}


def _gh_evict(now: float):
    """Keep the cache to GH_MAX_ACCOUNTS, oldest out first."""
    if len(_gh_cache) <= GH_MAX_ACCOUNTS:
        return
    for name, _ in sorted(_gh_cache.items(), key=lambda kv: kv[1][0])[:len(_gh_cache) - GH_MAX_ACCOUNTS]:
        _gh_cache.pop(name, None)
        _gh_inflight.pop(name, None)


def _gh_allow_miss(client_ip: str):
    """Charge one miss to this IP, or refuse.

    Only misses are counted. A visitor reading a cached heatmap is never
    limited however often they reload, so the ceiling can sit low enough to
    actually mean something."""
    now = time.time()
    with _gh_lock:
        hits = [t for t in _gh_misses.get(client_ip, []) if now - t < 3600]
        if client_ip != "unknown" and len(hits) >= GH_MISSES_PER_IP_HOUR:
            raise HTTPException(
                status_code=429,
                detail="Too many GitHub lookups from here in the last hour.",
            )
        hits.append(now)
        _gh_misses[client_ip] = hits
        _prune(_gh_misses, now)


def _gh_cached(username: str, max_age: float):
    with _gh_lock:
        entry = _gh_cache.get(username)
    if not entry:
        return None
    at, data = entry
    if time.time() - at > max_age:
        return None
    return at, data


async def _github_activity(username: str, client_ip: str, force: bool):
    username = (username or "").strip()
    if not github.valid_username(username):
        raise HTTPException(status_code=400, detail="Not a GitHub username")

    if not force:
        hit = _gh_cached(username, GH_FRESH_SECONDS)
        if hit:
            return {**hit[1], "cached": True, "age": int(time.time() - hit[0])}
        _gh_allow_miss(client_ip)

    lock = _gh_inflight.setdefault(username, asyncio.Lock())
    async with lock:
        # Re-check after waiting: whoever held the lock has just refreshed it.
        if not force:
            hit = _gh_cached(username, GH_FRESH_SECONDS)
            if hit:
                return {**hit[1], "cached": True, "age": int(time.time() - hit[0])}

        # to_thread, NOT a direct call. urllib is blocking and this app runs a
        # SINGLE worker on purpose (the viewer count, the robot's tap buffer
        # and the rate limiters all live in this process's memory). A ten
        # second blocking fetch on the event loop would freeze the site for
        # everyone, chat and all, while one heatmap loads.
        data = await asyncio.to_thread(github.fetch, username)

    if data.get("ok"):
        with _gh_lock:
            _gh_cache[username] = (time.time(), data)
            _gh_evict(time.time())
        return {**data, "cached": False, "age": 0}

    # Upstream is having a bad day. A stale calendar is enormously better
    # than the random demo squares the page falls back to, so anything within
    # a day is served with a note rather than thrown away.
    stale = _gh_cached(username, GH_STALE_SECONDS)
    if stale:
        return {**stale[1], "cached": True, "stale": True,
                "age": int(time.time() - stale[0]), "errors": data.get("errors", [])}

    # Nothing to serve. Remember the failure briefly so a broken upstream is
    # asked once a couple of minutes instead of once a visitor.
    with _gh_lock:
        _gh_cache[username] = (time.time() - (GH_FRESH_SECONDS - GH_FAIL_SECONDS), data)
        _gh_evict(time.time())
    return {**data, "cached": False, "age": 0}


@app.get("/api/github/{username}")
async def github_activity(username: str, request: Request):
    return await _github_activity(username, _client_ip(request), force=False)


# Forcing a refetch is deliberately NOT something a visitor can ask for: it
# skips the cache by definition, so a public `force=1` would hand anyone a
# switch for bypassing every protection above it. The editor has it instead.
@app.post("/api/github/{username}/refresh", dependencies=[Depends(require_admin)])
async def github_refresh(username: str, request: Request):
    return await _github_activity(username, _client_ip(request), force=True)


@app.get("/api/content/{section}", response_model=list[schemas.CategoryOut])
def get_content(section: str, db: Session = Depends(get_db)):
    valid_section(section)
    categories = (
        db.query(models.Category)
        .filter(models.Category.section == section)
        .order_by(models.Category.sort_order, models.Category.id)
        .all()
    )
    return categories


# ---------------------------------------------------------------------------
# Category admin endpoints
# ---------------------------------------------------------------------------
@app.post("/api/categories", response_model=schemas.CategoryOut, dependencies=[Depends(require_admin)])
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    valid_section(payload.section)
    category = models.Category(section=payload.section, name=payload.name.strip(), sort_order=payload.sort_order or 0)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@app.put("/api/categories/{category_id}", response_model=schemas.CategoryOut, dependencies=[Depends(require_admin)])
def update_category(category_id: int, payload: schemas.CategoryUpdate, db: Session = Depends(get_db)):
    category = db.get(models.Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.name is not None:
        category.name = payload.name.strip()
    if payload.sort_order is not None:
        category.sort_order = payload.sort_order
    db.commit()
    db.refresh(category)
    return category


@app.delete("/api/categories/{category_id}", dependencies=[Depends(require_admin)])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.get(models.Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for item in category.items:
        _delete_uploaded_file(item.media_url)
    db.delete(category)
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Item admin endpoints
# ---------------------------------------------------------------------------
def _save_upload(file: UploadFile, allow_pdf: bool = False) -> tuple[str, str]:
    """Validates and saves an uploaded file. Returns (media_type, media_url)."""
    content_type = file.content_type or ""
    is_pdf = allow_pdf and (
        content_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf")
    )
    if not is_pdf and not content_type.startswith(ALLOWED_MEDIA_PREFIXES):
        raise HTTPException(status_code=400, detail="Only image or video files are accepted")

    ext = Path(file.filename or "").suffix
    if not ext:
        ext = mimetypes.guess_extension(content_type) or ""
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / filename

    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large (25MB max)")
            out.write(chunk)

    if is_pdf:
        media_type = "file"
    elif content_type.startswith("image/"):
        media_type = "image"
    else:
        media_type = "video_file"
    return media_type, f"/uploads/{filename}"


# ---------------------------------------------------------------------------
# What kind of thing did they paste?
#
# The URL box used to assume everything pasted was a video, so a GitHub repo
# or an article link was stored as "video_link" and the site tried to treat
# it as one. Now the URL is classified by what it actually points at:
#   - a YouTube/Vimeo watch page  -> video_link  (embedded player)
#   - a direct image URL          -> image       (shown as a picture)
#   - a direct video file URL     -> video_file  (inline player)
#   - anything else               -> link        (clickable card, opens it)
# Extension checks ignore any ?query or #fragment on the end.
# ---------------------------------------------------------------------------
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg")
VIDEO_EXTENSIONS = (".mp4", ".webm", ".ogv", ".ogg", ".mov", ".m4v")
VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "youtube-nocookie.com")


def _classify_media_url(url: str) -> str:
    cleaned = (url or "").strip()
    lowered = cleaned.lower().split("?")[0].split("#")[0]
    host = lowered.split("//")[-1].split("/")[0]
    host = host[4:] if host.startswith("www.") else host

    if any(host == h or host.endswith("." + h) for h in VIDEO_HOSTS):
        return "video_link"
    if lowered.endswith(IMAGE_EXTENSIONS):
        return "image"
    if lowered.endswith(VIDEO_EXTENSIONS):
        return "video_file"
    return "link"


def _delete_uploaded_file(media_url: Optional[str]):
    if not media_url or not media_url.startswith("/uploads/"):
        return
    path = UPLOAD_DIR / Path(media_url).name
    if path.exists() and path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


@app.post("/api/items", response_model=schemas.ItemOut, dependencies=[Depends(require_admin)])
def create_item(
    category_id: int = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    tools: str = Form(""),
    sort_order: int = Form(0),
    video_url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    category = db.get(models.Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    media_type, media_url = "", ""
    if file is not None and file.filename:
        media_type, media_url = _save_upload(file)
    elif video_url:
        media_url = video_url.strip()
        media_type = _classify_media_url(media_url)

    item = models.Item(
        category_id=category_id,
        title=title.strip(),
        description=description,
        tools=tools,
        media_type=media_type,
        media_url=media_url,
        sort_order=sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.put("/api/items/{item_id}", response_model=schemas.ItemOut, dependencies=[Depends(require_admin)])
def update_item(
    item_id: int,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tools: Optional[str] = Form(None),
    sort_order: Optional[int] = Form(None),
    category_id: Optional[int] = Form(None),
    video_url: Optional[str] = Form(None),
    clear_media: Optional[bool] = Form(False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if title is not None:
        item.title = title.strip()
    if description is not None:
        item.description = description
    if tools is not None:
        item.tools = tools
    if sort_order is not None:
        item.sort_order = sort_order
    if category_id is not None:
        if not db.get(models.Category, category_id):
            raise HTTPException(status_code=404, detail="Category not found")
        item.category_id = category_id

    if file is not None and file.filename:
        _delete_uploaded_file(item.media_url)
        item.media_type, item.media_url = _save_upload(file)
    elif video_url is not None and video_url.strip():
        _delete_uploaded_file(item.media_url)
        item.media_url = video_url.strip()
        item.media_type = _classify_media_url(item.media_url)
    elif clear_media:
        _delete_uploaded_file(item.media_url)
        item.media_type, item.media_url = "", ""

    db.commit()
    db.refresh(item)
    return item


@app.delete("/api/items/{item_id}", dependencies=[Depends(require_admin)])
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _delete_uploaded_file(item.media_url)
    db.delete(item)
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Static files: uploaded media, then the portfolio + editor site itself.
# The "/" mount must be registered last so it doesn't shadow the /api routes.
#
# NoCacheStaticFiles forces every browser (and any CDN in front of this app)
# to revalidate style.css/script.js/index.html on every load instead of
# silently reusing a stale cached copy after a redeploy. Without this, a
# code fix can be shipped and the user still sees the OLD look indefinitely
# because their browser never re-requests the file — it looks exactly like
# "the fix didn't work" even though the server is serving the new version.
# Uploaded media (photos, videos) doesn't need this, so it's only applied to
# the "/" site mount, not "/uploads".
# ---------------------------------------------------------------------------
class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            # Serve the site's own styled 404 page instead of a bare
            # "Not Found" string, so a mistyped URL still looks like the site.
            if exc.status_code == 404 and (STATIC_DIR / "404.html").exists():
                return FileResponse(
                    STATIC_DIR / "404.html",
                    status_code=404,
                    headers={"Cache-Control": "no-cache, must-revalidate"},
                )
            raise
        if response.status_code == 404 and (STATIC_DIR / "404.html").exists():
            return FileResponse(
                STATIC_DIR / "404.html",
                status_code=404,
                headers={"Cache-Control": "no-cache, must-revalidate"},
            )
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response


# ---------------------------------------------------------------------------
# Link previews have to be rendered server-side.
#
# Facebook, Messenger, LinkedIn, X, Discord and WhatsApp fetch the page and
# read its <meta> tags WITHOUT running any JavaScript. So the settings the
# site applies in the browser are invisible to them — the tags have to be
# correct in the HTML as it leaves the server. These routes serve index.html
# with the placeholder domain swapped for the site address configured in the
# editor, plus the current title/description, so a pasted link shows a real
# preview card. Registered before the "/" mount so they take precedence.
# ---------------------------------------------------------------------------
PLACEHOLDER_ORIGIN = "https://example.com"

# Local/dev hosts are not worth advertising to a crawler or a link unfurler.
_LOCAL_HOST_PREFIXES = ("localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1")


def _request_origin(request: Request) -> str:
    """The address this request actually arrived on, as a scheme://host origin.

    Used only as a FALLBACK when the editor's Site URL is blank. Without it a
    deployment that skipped that one setting serves `https://example.com` in
    its og:url and og:image, so every shared link renders a preview card with
    no image - which is exactly what happened to this site in production. The
    host the visitor used is very nearly always the right answer, so guessing
    it beats shipping a placeholder.

    The Host header is client-controlled, so a forged value could appear in the
    tags of that one response. That is the attacker's own preview card and
    nothing else: the value is never stored, never trusted for auth, and is
    HTML-escaped on the way out.
    """
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip()
    host = host.split(",")[0].strip()
    if not host or any(host.lower().startswith(p) for p in _LOCAL_HOST_PREFIXES):
        return ""
    # Render and Cloudflare both terminate TLS in front of the app, so the
    # request reaching uvicorn is plain http. Trust the forwarded scheme.
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    if proto not in ("http", "https"):
        proto = "https"
    return f"{proto}://{host}"


def _effective_site_url(db: Session, request: Request) -> str:
    """Editor setting wins; the request's own origin is the fallback."""
    configured = (_settings_map(db).get("site_url") or "").strip().rstrip("/")
    if configured and configured != PLACEHOLDER_ORIGIN:
        return configured
    return _request_origin(request)


# ---------------------------------------------------------------------------
# ASSET VERSION — why this is computed, not typed
#
# index.html linked its CSS and JS as `style.css?v=50`. That number was
# written by hand at one release and then never touched again, so every
# version after it shipped the SAME asset URLs. Anything that caches by URL
# — a browser, and Cloudflare's edge in front of this site — was free to keep
# serving the older file while the HTML around it was new.
#
# That is not theoretical. It produces a page where the markup and one script
# are current but the stylesheet (or vice versa) is stale, so a feature that
# depends on both silently does nothing: a theme class gets applied by new JS
# that old CSS has no rule for, and the page falls back to a palette the user
# was not asking for. Debugging that from the outside looks like "the fix was
# never applied".
#
# The fingerprint below is the newest mtime across the static files, in base
# 36. It changes the moment any asset changes and cannot be forgotten, which
# is the whole point — a cache-buster a human has to remember to bump is a
# cache-buster that will be wrong.
# ---------------------------------------------------------------------------
_ASSET_EXTS = (".css", ".js", ".html")

def asset_version() -> str:
    newest = 0.0
    try:
        for f in STATIC_DIR.rglob("*"):
            if f.suffix.lower() in _ASSET_EXTS and f.is_file():
                newest = max(newest, f.stat().st_mtime)
    except OSError:
        return "0"
    # Base 36 keeps it short; seconds resolution is plenty for a deploy.
    n = int(newest)
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + out
    return out or "0"


_ASSET_QS = re.compile(r"(\.(?:css|js))\?v=[A-Za-z0-9._-]*")


def _stamp_assets(html: str) -> str:
    """Rewrite every `?v=...` on a local asset to the current fingerprint.

    NOT a lookbehind. `(?<=\.(?:css|js))` is variable width — three characters
    for .css, two for .js — and Python's `re` refuses to compile that, which
    took down the whole page with a 500 rather than failing quietly. Capturing
    the extension and putting it back is both legal and clearer."""
    ver = asset_version()
    return _ASSET_QS.sub(lambda m: m.group(1) + "?v=" + ver, html)


def _settings_map(db: Session) -> dict:
    stored = {s.key: (s.value or "") for s in db.query(models.Setting).all()}
    return {**seed.DEFAULT_SETTINGS, **stored}


def _render_index(db: Session, request: Request) -> HTMLResponse:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    settings = _settings_map(db)

    site_url = _effective_site_url(db, request)
    if site_url:
        html = html.replace(PLACEHOLDER_ORIGIN, _escape_attr(site_url))

    def set_meta(source: str, pattern: str, value: str) -> str:
        # re.sub treats backslashes in the replacement as escapes, so the
        # replacement is built with a function to keep the value literal.
        return re.sub(pattern, lambda m: m.group(1) + value + '"', source, count=1)

    title = (settings.get("site_title") or "").strip()
    if title:
        safe = _escape_attr(title)
        html = re.sub(r"<title>.*?</title>", lambda m: f"<title>{safe}</title>", html, count=1, flags=re.S)
        html = set_meta(html, r'(<meta property="og:title" content=")[^"]*"', safe)
        html = set_meta(html, r'(<meta name="twitter:title" content=")[^"]*"', safe)

    description = (settings.get("meta_description") or "").strip()
    if description:
        safe = _escape_attr(description)
        html = set_meta(html, r'(<meta name="description" content=")[^"]*"', safe)
        html = set_meta(html, r'(<meta property="og:description" content=")[^"]*"', safe)
        html = set_meta(html, r'(<meta name="twitter:description" content=")[^"]*"', safe)

    html = _stamp_assets(_inject_livereload(html))
    return HTMLResponse(html, headers={"Cache-Control": "no-cache, must-revalidate"})


def _inject_livereload(html: str) -> str:
    """Adds the live-reload script, and only in DEV. Injected here rather than
    written into index.html so a deployed build never ships a polling loop —
    the tag simply isn't in the HTML that gets served."""
    if not DEV_MODE:
        return html
    tag = '<script src="livereload.js"></script>\n</body>'
    return html.replace("</body>", tag, 1)


def _escape_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    )


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def serve_index(request: Request, db: Session = Depends(get_db)):
    return _render_index(db, request)


@app.get("/editor.html", include_in_schema=False)
def serve_editor():
    """Served by hand only so live reload can be injected into it too — the
    editor is where most of the editing happens, so it's the page that most
    wants to refresh itself. In production this is the same bytes the static
    mount would have returned."""
    html = (STATIC_DIR / "editor.html").read_text(encoding="utf-8")
    return HTMLResponse(_stamp_assets(_inject_livereload(html)),
                        headers={"Cache-Control": "no-cache, must-revalidate"})


@app.get("/robots.txt", include_in_schema=False)
def serve_robots(request: Request, db: Session = Depends(get_db)):
    text = (STATIC_DIR / "robots.txt").read_text(encoding="utf-8")
    site_url = _effective_site_url(db, request)
    if site_url:
        text = text.replace(PLACEHOLDER_ORIGIN, site_url)
    return PlainTextResponse(text, headers={"Cache-Control": "no-cache, must-revalidate"})


@app.get("/sitemap.xml", include_in_schema=False)
def serve_sitemap(request: Request, db: Session = Depends(get_db)):
    text = (STATIC_DIR / "sitemap.xml").read_text(encoding="utf-8")
    site_url = _effective_site_url(db, request)
    if site_url:
        text = text.replace(PLACEHOLDER_ORIGIN, site_url)
    return Response(text, media_type="application/xml", headers={"Cache-Control": "no-cache, must-revalidate"})


app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/", NoCacheStaticFiles(directory=str(STATIC_DIR), html=True), name="site")
