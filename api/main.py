"""
Expense API - the Gemini-backed half of the app.

Deliberately small: two real endpoints. The frontend talks to Firestore directly
for all CRUD, so this service exists only for the things that must not happen in
a browser - namely anything holding cloud credentials.

Importantly, /parse does NOT write to Firestore. It returns candidates; the
client confirms them and writes through its own existing code path, so the
Firestore security rules remain the single authorization layer. A backend that
could write directly would be a second, unaudited way into the ledger.
"""

import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth import require_user
from gemini import MAX_ACTIONS, MODEL, parse_expenses, plan_actions, write_insight

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="AI Expense Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ai-expense-tracker-navya.web.app",
        "https://ai-expense-tracker-navya.firebaseapp.com",
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# Guards against a runaway upload burning credits, and against a browser sending
# a ten-minute recording by accident. ~1MB of base64 is roughly a minute of opus.
MAX_AUDIO_BASE64 = 1_500_000

DEFAULT_CATEGORIES = ["Food", "Transport", "Groceries", "Shopping", "Bills", "Health", "Other"]
DEFAULT_METHODS = ["upi", "cash", "card", "bank_transfer"]


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------


class ParseRequest(BaseModel):
    text: str | None = None
    audio_base64: str | None = None
    mime_type: str | None = None
    categories: list[str] = Field(default_factory=lambda: list(DEFAULT_CATEGORIES))
    methods: list[str] = Field(default_factory=lambda: list(DEFAULT_METHODS))


class Candidate(BaseModel):
    amount_rupees: float
    description: str
    category: str
    payment_method: str
    occurred_on: str = ""
    note: str = ""
    confidence: float = 0.5


class ParseResponse(BaseModel):
    candidates: list[Candidate]
    model: str


class PlanRequest(BaseModel):
    text: str | None = None
    audio_base64: str | None = None
    mime_type: str | None = None
    """Name and type only - the planner never needs amounts or the ledger itself."""
    existing_tracks: list[dict] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=lambda: list(DEFAULT_CATEGORIES))
    """The client's own local date (YYYY-MM-DD) and IANA zone. See gemini.py."""
    today: str | None = None
    timezone: str | None = None


class PlannedAction(BaseModel):
    tool: str
    args: dict


class PlanResponse(BaseModel):
    actions: list[PlannedAction]
    reply: str
    """What the model heard, word for word, so a mishearing is visible."""
    transcript: str = ""
    model: str


class InsightRequest(BaseModel):
    """Figures the client already computed. The model is never asked to do arithmetic."""

    month: str
    income_rupees: float
    committed_rupees: float
    planned_savings_rupees: float
    spent_rupees: float
    safe_to_spend_rupees: float
    days_remaining: int
    top_categories: list[dict] = Field(default_factory=list)
    previous_month_spent_rupees: float | None = None


class InsightResponse(BaseModel):
    headline: str
    body: str
    actions: list[str]
    model: str


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


@app.get("/health")
async def health():
    """Unauthenticated on purpose - load tests and uptime checks need a cheap probe."""
    return {"ok": True, "model": MODEL}


@app.post("/parse", response_model=ParseResponse)
async def parse(req: ParseRequest, uid: str = Depends(require_user)):
    if not req.text and not req.audio_base64:
        raise HTTPException(status_code=400, detail="Provide either text or audio_base64")

    if req.audio_base64 and len(req.audio_base64) > MAX_AUDIO_BASE64:
        raise HTTPException(status_code=413, detail="Recording too long - keep it under a minute")

    try:
        raw = parse_expenses(
            text=req.text,
            audio_base64=req.audio_base64,
            mime_type=req.mime_type,
            categories=req.categories or DEFAULT_CATEGORIES,
            methods=req.methods or DEFAULT_METHODS,
        )
    except Exception as exc:
        log.exception("Parse failed for uid=%s", uid)
        raise HTTPException(status_code=502, detail="Could not reach the model") from exc

    candidates: list[Candidate] = []
    for item in raw:
        try:
            candidate = Candidate(**item)
        except Exception:
            # Skip a malformed entry rather than failing the whole utterance -
            # two good expenses out of three beats none.
            log.warning("Discarded malformed candidate: %s", item)
            continue

        # A zero or negative amount is not an expense, whatever the model says.
        if candidate.amount_rupees > 0:
            candidates.append(candidate)

    log.info("uid=%s parsed=%d source=%s", uid, len(candidates), "audio" if req.audio_base64 else "text")
    return ParseResponse(candidates=candidates, model=MODEL)


ALLOWED_TOOLS = {
    "create_track",
    "update_track",
    "create_expense",
    "set_monthly_income",
    "set_bank_balance",
    "create_category",
}


@app.post("/plan", response_model=PlanResponse)
async def plan(req: PlanRequest, uid: str = Depends(require_user)):
    """
    Turn an instruction into a list of intended actions.

    Nothing is executed here. The client confirms the plan and applies it through
    its own Firestore write path, so the security rules stay the only
    authorization layer and this service holds no write credentials at all.
    """
    if not req.text and not req.audio_base64:
        raise HTTPException(status_code=400, detail="Provide either text or audio_base64")

    if req.audio_base64 and len(req.audio_base64) > MAX_AUDIO_BASE64:
        raise HTTPException(status_code=413, detail="Recording too long - keep it under a minute")

    try:
        actions, reply, transcript = plan_actions(
            text=req.text,
            audio_base64=req.audio_base64,
            mime_type=req.mime_type,
            existing_tracks=req.existing_tracks,
            categories=req.categories or DEFAULT_CATEGORIES,
            today=req.today,
            timezone=req.timezone,
        )
    except Exception as exc:
        log.exception("Plan failed for uid=%s", uid)
        raise HTTPException(status_code=502, detail="Could not reach the model") from exc

    # Drop anything not on the allowlist. The model should never emit an unknown
    # tool, but a planner whose output is applied to a ledger gets a hard filter.
    safe = [PlannedAction(tool=a["tool"], args=a["args"]) for a in actions if a["tool"] in ALLOWED_TOOLS]

    if len(safe) != len(actions):
        log.warning("uid=%s dropped %d unrecognised actions", uid, len(actions) - len(safe))

    log.info(
        "uid=%s planned=%d cap=%d transcript_chars=%d", uid, len(safe), MAX_ACTIONS, len(transcript)
    )
    return PlanResponse(actions=safe, reply=reply, transcript=transcript, model=MODEL)


@app.post("/insights", response_model=InsightResponse)
async def insights(req: InsightRequest, uid: str = Depends(require_user)):
    try:
        result = write_insight(req.model_dump())
    except Exception as exc:
        log.exception("Insight failed for uid=%s", uid)
        raise HTTPException(status_code=502, detail="Could not reach the model") from exc

    return InsightResponse(
        headline=result.get("headline", ""),
        body=result.get("body", ""),
        actions=result.get("actions", []),
        model=MODEL,
    )
