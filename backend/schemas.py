from datetime import datetime
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

# Headings are stored in a VARCHAR(200). Postgres rejects a longer value with
# an error, which surfaced as a bare 500 in the editor; validating here turns
# it into a clear 422 instead. Whitespace is stripped BEFORE the length check,
# so a heading of only spaces is refused rather than saved as a blank one.
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    title: str
    description: str = ""
    tools: str = ""
    media_type: str = ""
    media_url: str = ""
    sort_order: int = 0

    # Rows written by older versions (or edited by hand in the database) can
    # hold NULL in these text columns. The public site treats them as empty,
    # so the API does too, instead of failing the whole section's response.
    @field_validator("description", "tools", "media_type", "media_url", mode="before")
    @classmethod
    def _none_is_empty(cls, value):
        return "" if value is None else value


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section: str
    name: str
    sort_order: int
    items: List[ItemOut] = []


class CategoryCreate(BaseModel):
    section: str
    name: CategoryName
    sort_order: Optional[int] = 0


class CategoryUpdate(BaseModel):
    name: Optional[CategoryName] = None
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
    # Proves the name is this device's own claim. Without it the server
    # cannot tell a real chatter from someone typing another person's name
    # into a request, so an unverified name is shown as an anonymous viewer.
    device_id: str = ""


class RobotHitIn(BaseModel):
    name: str = ""
    # Proves the attacker actually claimed that name — see ChatName.
    device_id: str = ""
    # Where on the robot they tapped, normalised 0-1 within the stage, so
    # the same tap lands in the same place on everyone else's screen.
    x: float = 0.5
    y: float = 0.5
