"""
Gemini access, via Vertex AI.

Why Vertex and not the Gemini Developer API: the Developer API's free tier stops
working the moment a billing account is attached to the project, and its paid
tier draws on a prepaid wallet that the GCP trial credits do not cover (verified
- it returns 429 "prepayment credits are depleted"). Vertex bills through normal
GCP billing, so the trial credits apply, and it authenticates with the service
account identity - there is no API key to leak.

Location is "global", not asia-south1: newer models are served from the global
endpoint first, and gemini-3.6-flash 404s on every regional one.
"""

import json
import logging
import os
from datetime import date

from google import genai
from google.genai import types

log = logging.getLogger(__name__)

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "ai-expense-tracker-navya")
LOCATION = "global"
MODEL = "gemini-3.6-flash"

client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)


# --------------------------------------------------------------------------
# Expense parsing
# --------------------------------------------------------------------------

PARSE_SYSTEM = """\
You extract expense records from Indian personal-finance speech and text.

Rules:
- Amounts are Indian rupees. "sixteen hundred" is 1600, "2k" is 2000, "arda" or
  "half" of a stated amount is that amount halved. Never invent an amount.
- One utterance may contain SEVERAL expenses ("300 auto, 250 lunch, 1200
  groceries") - return one object per expense, in the order spoken.
- Code-mixed Hindi/Telugu/Tamil with English is normal: "sau rupaye chai pe" is
  100 on tea. Translate the description to short English.
- description is 1-4 words, lowercase unless a proper merchant name.
- Pick category ONLY from the provided list. If nothing fits, use "Other".
- payment_method: "upi" unless another is clearly stated. Cash, card and bank
  transfer must be explicit.
- occurred_on: ISO YYYY-MM-DD. Use today unless a date is stated ("yesterday",
  "on the 3rd"). Return "" if genuinely unclear.
- note: only if the speaker gave a reason or occasion. Otherwise "".
- confidence: 0.0-1.0. Be honest. Below 0.6 if the amount was unclear or the
  audio was hard to make out - a wrong amount in a financial record is far worse
  than asking the user to confirm.

Return ONLY the JSON array."""


def candidate_schema(categories: list[str], methods: list[str]) -> dict:
    """
    Response schema for the parser.

    Categories are injected from the client's actual list rather than hardcoded,
    so the model can never invent "Lunch" when the app already has "Food" - which
    is how category sprawl starts.
    """
    return {
        "type": "ARRAY",
        "items": {
            "type": "OBJECT",
            "properties": {
                "amount_rupees": {"type": "NUMBER"},
                "description": {"type": "STRING"},
                "category": {"type": "STRING", "enum": categories},
                "payment_method": {"type": "STRING", "enum": methods},
                "occurred_on": {"type": "STRING"},
                "note": {"type": "STRING"},
                "confidence": {"type": "NUMBER"},
            },
            "required": [
                "amount_rupees",
                "description",
                "category",
                "payment_method",
                "confidence",
            ],
        },
    }


def parse_expenses(
    *,
    text: str | None,
    audio_base64: str | None,
    mime_type: str | None,
    categories: list[str],
    methods: list[str],
) -> list[dict]:
    """Turn speech or text into structured expense candidates."""

    parts: list[types.Part] = []

    if audio_base64:
        import base64

        parts.append(
            types.Part.from_bytes(
                data=base64.b64decode(audio_base64),
                mime_type=mime_type or "audio/webm",
            )
        )
        parts.append(types.Part.from_text(text="Extract the expenses from this recording."))
    else:
        parts.append(types.Part.from_text(text=f"Extract the expenses from: {text}"))

    response = client.models.generate_content(
        model=MODEL,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            system_instruction=f"{PARSE_SYSTEM}\n\nToday is {date.today().isoformat()}.",
            response_mime_type="application/json",
            response_schema=candidate_schema(categories, methods),
            temperature=0,
        ),
    )

    raw = (response.text or "").strip()
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        log.error("Model returned unparseable JSON: %s", raw[:200])
        return []

    return parsed if isinstance(parsed, list) else [parsed]


# --------------------------------------------------------------------------
# Monthly narrative
# --------------------------------------------------------------------------

INSIGHT_SYSTEM = """\
You write a short, plain monthly review of someone's spending.

You are GIVEN the figures. Never compute, estimate or invent a number - use only
what appears in the input, and quote amounts exactly as given.

Voice: direct and useful, like a sharp friend who has seen the numbers. No
moralising about spending, no cheerleading, no finance jargon. Indian rupee
formatting with lakh grouping.

- headline: one sentence, the single most useful observation.
- body: 2-4 sentences. Say what actually happened and why it matters. If
  commitments and savings dominate, say so rather than scolding about discretionary
  spending.
- actions: 1-3 concrete, specific things worth doing next month. Not "spend less"
  - something a person could actually act on, tied to the numbers given.

Return ONLY JSON."""

INSIGHT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "headline": {"type": "STRING"},
        "body": {"type": "STRING"},
        "actions": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["headline", "body", "actions"],
}


def write_insight(figures: dict) -> dict:
    """Turn already-computed figures into a written review."""

    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=json.dumps(figures, indent=1))],
            )
        ],
        config=types.GenerateContentConfig(
            system_instruction=INSIGHT_SYSTEM,
            response_mime_type="application/json",
            response_schema=INSIGHT_SCHEMA,
            temperature=0.3,
        ),
    )

    raw = (response.text or "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log.error("Insight model returned unparseable JSON: %s", raw[:200])
        return {"headline": "", "body": "", "actions": []}


# --------------------------------------------------------------------------
# Action planning (tool calling)
# --------------------------------------------------------------------------

PLAN_SYSTEM = """\
You turn spoken instructions about personal finances into function calls.

You do not answer questions or chat - you decide which functions to call, with
which arguments. Call as many as the instruction requires.

Understanding the model of this app:
- A "track" is a bucket money comes out of, and has one of four types:
  * spending   - a monthly allowance that resets. Daily Expenses, Eating Out.
  * commitment - a known amount on a known day of the month. EMI, rent, a SIP,
                 a subscription. Reserved up front before anything else.
  * goal       - accumulates toward a target. Emergency Fund. Holdings such as
                 mutual funds or shares are goals, with the current value as the
                 amount already saved.
  * project    - date-bounded: saves, then spends down, then closes. A trip.
- Several amounts on several dates means SEVERAL commitment tracks, one per
  date. "SIPs: 15th 15k, 6th 10k" is two commitments, not one.
- Name tracks the way the person said it, but make each one distinguishable:
  "Mutual Fund SIP (15th)" and "Mutual Fund SIP (6th)".

Amount rules:
- Indian rupees. "60k" is 60000, "sixteen hundred" is 1600, "1.5 lakh" is 150000.
- Never invent an amount. Omit the argument if none was stated.

If the instruction names an EXISTING track, call update_track rather than
creating a duplicate. The existing tracks are given to you.

If the instruction is not actionable - a question, or something these functions
cannot do - call nothing and reply in one short sentence saying so."""

TOOLS = [
    {
        "function_declarations": [
            {
                "name": "create_track",
                "description": (
                    "Create a new track (a bucket money comes out of). Use for SIPs, EMIs, "
                    "rent, subscriptions, savings goals, holdings and trips."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING", "description": "Short, distinguishable name"},
                        "type": {
                            "type": "STRING",
                            "enum": ["spending", "commitment", "goal", "project"],
                        },
                        "amount_rupees": {
                            "type": "NUMBER",
                            "description": (
                                "Monthly limit for spending; amount due for commitment; "
                                "target or current holding value for goal; budget for project"
                            ),
                        },
                        "due_day": {
                            "type": "INTEGER",
                            "description": "Day of month 1-31. Commitments only.",
                        },
                        "per_month_rupees": {
                            "type": "NUMBER",
                            "description": "Amount set aside each month. Goals and projects only.",
                        },
                        "locked": {
                            "type": "BOOLEAN",
                            "description": (
                                "True if this goal must be excluded from spending advice, "
                                "e.g. an emergency fund"
                            ),
                        },
                    },
                    "required": ["name", "type"],
                },
            },
            {
                "name": "update_track",
                "description": "Change an existing track. Match on its exact current name.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "track_name": {"type": "STRING"},
                        "new_name": {"type": "STRING"},
                        "amount_rupees": {"type": "NUMBER"},
                        "due_day": {"type": "INTEGER"},
                        "per_month_rupees": {"type": "NUMBER"},
                        "locked": {"type": "BOOLEAN"},
                    },
                    "required": ["track_name"],
                },
            },
            {
                "name": "create_expense",
                "description": "Record money already spent, received, or moved.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "amount_rupees": {"type": "NUMBER"},
                        "description": {"type": "STRING", "description": "1-4 words"},
                        "category": {"type": "STRING"},
                        "payment_method": {
                            "type": "STRING",
                            "enum": ["upi", "cash", "card", "bank_transfer"],
                        },
                        "movement": {
                            "type": "STRING",
                            "enum": ["expense", "income", "transfer", "refund"],
                        },
                        "track_name": {
                            "type": "STRING",
                            "description": "Which track this comes out of. May be one created in this same instruction.",
                        },
                        "occurred_on": {"type": "STRING", "description": "ISO YYYY-MM-DD"},
                        "note": {"type": "STRING"},
                    },
                    "required": ["amount_rupees", "description"],
                },
            },
            {
                "name": "set_monthly_income",
                "description": "Set the monthly income that Safe-to-Spend is calculated from.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {"rupees": {"type": "NUMBER"}},
                    "required": ["rupees"],
                },
            },
        ]
    }
]

# A single utterance should never produce more than this. Protects against a
# misheard instruction fanning out into dozens of writes.
MAX_ACTIONS = 20


def plan_actions(
    *,
    text: str | None,
    audio_base64: str | None,
    mime_type: str | None,
    existing_tracks: list[dict],
    categories: list[str],
) -> tuple[list[dict], str]:
    """
    Turn an instruction into a list of intended function calls.

    Returns (actions, reply). Nothing is executed here - the caller sends these
    back to the client, which confirms them and applies them through its own
    write path. The backend deliberately holds no Firestore write credentials.
    """
    parts: list[types.Part] = []

    if audio_base64:
        import base64

        parts.append(
            types.Part.from_bytes(
                data=base64.b64decode(audio_base64), mime_type=mime_type or "audio/webm"
            )
        )
        parts.append(types.Part.from_text(text="Do what this recording asks."))
    else:
        parts.append(types.Part.from_text(text=text or ""))

    track_summary = (
        "\n".join(f"- {t.get('name')} ({t.get('type')})" for t in existing_tracks)
        or "- (none yet)"
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            system_instruction=(
                f"{PLAN_SYSTEM}\n\n"
                f"Today is {date.today().isoformat()}.\n\n"
                f"Existing tracks:\n{track_summary}\n\n"
                f"Valid expense categories: {', '.join(categories)}"
            ),
            tools=TOOLS,
            temperature=0,
        ),
    )

    actions: list[dict] = []
    reply_parts: list[str] = []

    candidates = response.candidates or []
    for part in (candidates[0].content.parts if candidates and candidates[0].content else []):
        call = getattr(part, "function_call", None)
        if call and call.name:
            actions.append({"tool": call.name, "args": dict(call.args or {})})
        elif getattr(part, "text", None):
            reply_parts.append(part.text)

    if len(actions) > MAX_ACTIONS:
        log.warning("Truncating %d actions to %d", len(actions), MAX_ACTIONS)
        actions = actions[:MAX_ACTIONS]

    return actions, " ".join(reply_parts).strip()
