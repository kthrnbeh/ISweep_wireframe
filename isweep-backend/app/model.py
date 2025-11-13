# app/models.py
# -------------------------------------------------
# Pydantic models (data shapes) used by our API.
# These define what JSON the frontend sends/receives.
# -------------------------------------------------

from enum import Enum
from pydantic import BaseModel
from typing import Optional


class ContentType(str, Enum):
    """Types of content the user can filter."""
    language = "language"   # swearing, profanity
    violence = "violence"
    sexual = "sexual"
    other = "other"


class Action(str, Enum):
    """Actions ISweep can take on the media."""
    none = "none"            # do nothing
    mute = "mute"            # mute audio
    skip = "skip"            # jump ahead a little
    fast_forward = "fast_forward"  # play faster speed


class Preference(BaseModel):
    """
    A single user rule:
    e.g. For sexual content -> skip 20 seconds.
    """
    user_id: str
    content_type: ContentType
    action: Action
    duration_seconds: Optional[float] = None  # how long to mute/skip/fast_forward
    enabled: bool = True


class Event(BaseModel):
    """
    An event from a player / AI detector.
    Example: "At timestamp 123.5, we think this is sexual content with 0.92 confidence"
    """
    user_id: str
    timestamp: float           # seconds into the video
    source: str                # "browser", "firetv", "iphone", etc.
    text: Optional[str] = None # subtitle/closed-caption text
    content_type: Optional[ContentType] = None
    confidence: Optional[float] = None        # 0.0 - 1.0
    manual_override: bool = False             # true if user pressed "broom" manually


class DecisionResponse(BaseModel):
    """
    What the backend tells the player to do for this event.
    """
    action: Action
    duration_seconds: Optional[float] = None
    show_icon: bool = False                  # whether to show the tiny broom icon
    reason: Optional[str] = None             # for debugging / logs
