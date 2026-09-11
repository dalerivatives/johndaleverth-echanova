from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from .database import Base

# A "section" groups content by which part of the site it belongs to.
SECTIONS = ("project", "achievement", "tool")


class Category(Base):
    """A heading inside a section, e.g. "Embedded Systems" under Projects.
    Each category is its own swipeable strip / storage box of items."""

    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    section = Column(String(20), nullable=False, index=True)  # project | achievement | tool
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship(
        "Item",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Item.sort_order",
    )


class Setting(Base):
    """One editable piece of site text or configuration, stored as key/value.

    Everything the editor can change that isn't a Category or an Item lives
    here: the name in the hero, the tagline, the terminal lines, the chat
    copy, the footer, every social link, the GitHub username, the SEO text,
    and the paths of the uploaded resume/portrait. Key/value rather than a
    wide table so adding a new editable field only means adding a default in
    seed.DEFAULT_SETTINGS and a field to the editor form — no migration.
    """

    __tablename__ = "settings"

    key = Column(String(80), primary_key=True, index=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChatName(Base):
    """A display name claimed by one device, held for as long as the chat is.

    The chat is a 24-hour room: messages expire, and so do the names that
    posted them, so the whole thing genuinely resets rather than leaving a
    permanent registry of nicknames behind an empty log.

    Identity here is the `device_id` — a random value the browser generates
    once and keeps. It is not proof of anything (anyone can clear it and get
    a new one), but it is stable enough to answer the only question this
    needs to answer: is this the same visitor who claimed that name earlier
    today? The IP is recorded alongside it as a second limit, so one
    connection can't farm a dozen names.

    Trade-off worth knowing: several people behind one router or campus
    network share an IP, so the second of them is asked to share the first
    one's name rather than claiming their own. That is the cost of "1 device,
    1 IP = 1 name"; loosening it to device-only would let one person claim
    names endlessly from private windows.
    """

    __tablename__ = "chat_names"

    # The lowercased name, so "Dale" and "dale" can't both be claimed.
    name_key = Column(String(40), primary_key=True, index=True)
    name = Column(String(40), nullable=False)          # as typed, for display
    device_id = Column(String(64), nullable=False, index=True)
    ip = Column(String(64), default="", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # The captcha result, held HERE rather than in the browser.
    # It was a localStorage flag once, and that flag outlived the thing it was
    # about: the 24-hour reset wiped the room and rebuilt the robot at full
    # health, but the browser still said "beaten", so the composer stayed open
    # for a robot that had never been touched. Anything that expires with the
    # room has to live with the room.
    verified_at = Column(DateTime(timezone=True), nullable=True)
    # Set on every hit, cleared when the robot dies — this is what lets
    # everyone who actually damaged UNIT-01 during a life count as having
    # destroyed it, not only whoever happened to land the last blow.
    hit_since_respawn = Column(Boolean, default=False, nullable=False)

    # Leaderboard tallies for the CURRENT LIFE of the robot, not the day.
    # Both are zeroed for everyone the moment UNIT-01 goes down, because the
    # question the board answers is "who destroyed this one?" — and a running
    # total across a dozen lives answers a different question badly: it reads
    # past 100%, it can't be beaten by a newcomer, and it stops being about
    # the fight happening now.
    damage_dealt = Column(Float, default=0.0, nullable=False)   # this round
    blows = Column(Integer, default=0, nullable=False)          # this round
    # How many rounds this person has topped. THIS one accumulates — it's the
    # only score that should, because each crown was won outright.
    crowns = Column(Integer, default=0, nullable=False)


class ChatMessage(Base):
    """One message in the public World Chat.

    Anyone viewing the site can post: they pick a display name, type a
    message, and it appears for every other viewer. No accounts — the name is
    self-assigned and not verified, which is the point of a world chat. The
    owner can delete anything from the editor's Chat tab.
    """

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(40), nullable=False)
    body = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class LinkPreview(Base):
    """Cached Open Graph data for a pasted link, so a card can show what the
    destination site actually looks like.

    Cached because the fetch is slow and the target site shouldn't be hit
    once per visitor per page load. `fetched_at` drives refresh; `ok` is
    False for links that couldn't be read (blocked, offline, not HTML), so
    a dead link isn't re-fetched on every single view.
    """

    __tablename__ = "link_previews"

    url = Column(String(1000), primary_key=True)
    title = Column(String(300), default="")
    description = Column(String(600), default="")
    image = Column(String(1000), default="")
    site_name = Column(String(200), default="")
    ok = Column(Boolean, default=False)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())


class RobotState(Base):
    """The World Chat's shared robot — one row, id=1.

    Server-authoritative on purpose: everyone tapping is hitting the same
    robot, so HP can't live in the browser or each visitor would see a
    different number. Kept in the database rather than memory so it survives
    a restart and stays correct if this is ever run with more than one
    worker process.
    """

    __tablename__ = "robot_state"

    id = Column(Integer, primary_key=True)
    hp = Column(Float, default=100.0)          # percentage, 0-100
    dead_until = Column(Float, default=0.0)    # unix seconds; 0 = alive
    kills = Column(Integer, default=0)
    last_hit_by = Column(String(40), default="")
    total_hits = Column(Integer, default=0)

    # The winner of the most recently completed life: whoever dealt the most
    # damage during it. Stored here rather than recomputed because the per-name
    # tallies it was derived from are wiped the instant the round ends.
    last_destroyer = Column(String(40), default="")
    last_destroyer_damage = Column(Float, default=0.0)
    last_destroyer_blows = Column(Integer, default=0)


class Item(Base):
    """A single card inside a category — a project, an achievement, or a tool entry."""

    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    tools = Column(String(600), default="")  # comma-separated tags/tools used
    # "" | image | video_file | video_link | link
    #   image      — a picture (uploaded, or a remote image URL)
    #   video_file — a video that plays inline (uploaded, or a direct .mp4 etc.)
    #   video_link — YouTube/Vimeo, embedded as a player
    #   link       — anything else pasted: rendered as a clickable link card
    media_type = Column(String(20), default="")
    media_url = Column(String(1000), default="")
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("Category", back_populates="items")
