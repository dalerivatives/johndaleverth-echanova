from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    title: str
    description: str
    tools: str
    media_type: str
    media_url: str
    sort_order: int


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section: str
    name: str
    sort_order: int
    items: List[ItemOut] = []


class CategoryCreate(BaseModel):
    section: str
    name: str
    sort_order: Optional[int] = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class LoginIn(BaseModel):
    key: str


class ChatMessageIn(BaseModel):
    name: str
    body: str
    # Proves the sender actually claimed this name — see ChatName in models.
    device_id: str = ""


class ChatNameIn(BaseModel):
    name: str
    device_id: str


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    body: str
    created_at: Optional[datetime] = None


class PresenceIn(BaseModel):
    viewer_id: str
    # The chat name this tab has claimed, if any. Optional on purpose: a
    # visitor who never joins the chat stays anonymous and is counted
    # without ever being named.
    name: str = ""


class RobotHitIn(BaseModel):
    name: str = ""
    # Proves the attacker actually claimed that name — see ChatName.
    device_id: str = ""
    # Where on the robot they tapped, normalised 0-1 within the stage, so
    # the same tap lands in the same place on everyone else's screen.
    x: float = 0.5
    y: float = 0.5
