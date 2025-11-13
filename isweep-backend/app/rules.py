# app/rules.py
# -------------------------------------------------
# Very simple in-memory "database" of preferences
# and a function to turn Events into Decisions.
#
# Later we can:
#  - store this in SQLite or Postgres
#  - add real ML models
#  - add learning based on manual_override
# -------------------------------------------------

from typing import Dict, Tuple

from .models import Preference, Event, DecisionResponse, Action


# Key: (user_id, content_type) -> Preference
_preferences: Dict[Tuple[str, str], Preference] = {}


def save_preference(pref: Preference) -> None:
    """Save or update a user's preference in memory."""
    key = (pref.user_id, pref.content_type.value)
    _preferences[key] = pref


def get_preference(user_id: str, content_type: str) -> Preference | None:
    """Look up a preference for a given user and content type."""
    return _preferences.get((user_id, content_type))


def decide(event: Event) -> DecisionResponse:
    """
    Core decision engine:
    - checks user preferences
    - checks confidence
    - returns an Action & whether to show the broom icon
    """
    # Default: do nothing
    decision = DecisionResponse(
        action=Action.none,
        duration_seconds=None,
        show_icon=False,
        reason="No matching preference or low confidence."
    )

    # Manual override means: user clicked something like "this was bad" or "skip now".
    if event.manual_override:
        decision.action = Action.skip
        decision.duration_seconds = 10.0
        decision.show_icon = True
        decision.reason = "Manual override from user."
        return decision

    # If we don't know content type, we can't apply rules yet.
    if not event.content_type:
        decision.reason = "No content_type provided."
        return decision

    # Optional: require a minimum confidence threshold
    if event.confidence is not None and event.confidence < 0.75:
        decision.reason = f"Confidence {event.confidence} below threshold."
        return decision

    pref = get_preference(event.user_id, event.content_type.value)
    if not pref or not pref.enabled:
        decision.reason = "No enabled preference for this content type."
        return decision

    # Apply user's preference
    decision.action = pref.action
    decision.duration_seconds = pref.duration_seconds
    decision.show_icon = True
    decision.reason = f"Matched preference for {event.content_type.value}."

    return decision
