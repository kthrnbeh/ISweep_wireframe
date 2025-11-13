# app/main.py
# -------------------------------------------------
# FastAPI application entry point.
# This exposes HTTP endpoints that frontends can call.
# -------------------------------------------------

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import Preference, Event, DecisionResponse
from . import rules


app = FastAPI(
    title="ISweep Backend",
    description="AI remote brain that decides when to mute/skip/fast-forward.",
    version="0.1.0",
)

# CORS (Cross-Origin Resource Sharing) so browser apps can call this API.
# During development we can allow everything, later we can lock this down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to your domain later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Simple endpoint to see if the server is running."""
    return {"status": "ok", "message": "ISweep backend is alive"}


@app.post("/preferences")
def set_preference(pref: Preference):
    """
    Save or update a user preference.

    Example JSON body:
    {
      "user_id": "user123",
      "content_type": "language",
      "action": "mute",
      "duration_seconds": 5
    }
    """
    rules.save_preference(pref)
    return {"status": "saved", "preference": pref}


@app.post("/event", response_model=DecisionResponse)
def handle_event(event: Event):
    """
    Handle an event from a player / AI detector and return a decision.

    Example JSON body:
    {
      "user_id": "user123",
      "timestamp": 120.5,
      "source": "browser",
      "text": "some subtitle line with a swear word",
      "content_type": "language",
      "confidence": 0.92
    }
    """
    decision = rules.decide(event)
    return decision
