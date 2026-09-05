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

RECEIPTS. When given a photo of a bill instead of speech, call heard() with a one-line
summary of what you read - merchant, total, and item count, e.g. "Barbeque Nation,
Rs 1,840, 6 items" - so the user can see whether it was read correctly before anything
is saved. Then call create_expense ONCE for the bill TOTAL, not once per line item: a
receipt is one payment. Put the itemisation in the note, comma separated and shortened,
so the detail survives without cluttering the ledger - "paneer tikka 320, biryani 480,
2 cold drinks 120". Use the merchant as the description, the bill date as occurred_on if
it is printed, and infer payment_method only if the receipt states it. If the total is
unreadable, say so through heard() and call nothing else - a guessed total is worse than
no entry.

ALWAYS call heard() first, exactly once, with a word-for-word transcription of
what was said. The user needs to see what you heard, because a misheard amount
is otherwise invisible to them - they would see a wrong number with no way to
tell why. Transcribe verbatim even when you cannot act on it.

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

Distinguish these three carefully, because they are easy to confuse:
- "I have 60k in mutual funds"       -> opening_balance_rupees on a GOAL track
- "I want to reach 3 lakh"           -> amount_rupees (the target)
- "I put 15k in every month"         -> per_month_rupees, or a commitment if it
                                        leaves on a fixed date
A stated current holding is never a target and never a monthly amount.

"My account has 84 thousand" is the BANK balance - set_bank_balance - not a track.

CORRECTIONS. You are given the most recent transactions with their ids. When the user
wants to fix something already recorded - "change the salary credited category to
salary", "that lunch was 250 not 2500", "put the vet bill under Health" - find the
matching transaction in that list and call update_expense with its id. Do NOT create a
new expense to correct an old one.

If the corrected category does not exist yet, call create_category as well and use that
name.

To change a category everywhere rather than on one entry - "rename Other to Salary",
"move everything from Food to Eating Out" - call rename_category.

CATEGORIES. You are given the ones that exist. Use them. Only call
create_category when the user explicitly asks ("add a category for pets") or
when an expense truly fits none of them. Never create a variant of one that
exists - not "Foods" beside "Food", not "Lunch" or "Dining" beside "Eating Out".
A category list that grows a synonym every week makes every breakdown useless.
If nothing fits and the user did not ask for a new one, use "Other".

If the instruction records an expense and NO existing track suits it, also call
create_track for a spending track to hold it - "Daily Expenses" is a reasonable
default - and put that name in the expense's track_name. Every expense must come
out of a track.

If the instruction is not actionable - a question, or something these functions
cannot do - call nothing and reply in one short sentence saying so."""

TOOLS = [
    {
        "function_declarations": [
            {
                "name": "heard",
                "description": (
                    "Report what the user actually said, transcribed word for word. "
                    "ALWAYS call this exactly once, before any other function."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "transcript": {
                            "type": "STRING",
                            "description": (
                                "The user's words verbatim. Do not tidy, translate or "
                                "summarise. Numbers as spoken."
                            ),
                        },
                    },
                    "required": ["transcript"],
                },
            },
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
                        "opening_balance_rupees": {
                            "type": "NUMBER",
                            "description": (
                                "Money ALREADY in this pot before tracking started. "
                                "\"I have mutual funds of 60k\" is an opening balance of 60000, "
                                "not a target and not a monthly amount."
                            ),
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
                        "opening_balance_rupees": {"type": "NUMBER"},
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
                "name": "update_expense",
                "description": (
                    "Correct an expense that is already recorded - its category, track, "
                    "amount, description or date. Use the transaction_id from the recent "
                    "transactions you were given. This is how a miscategorised entry gets "
                    "fixed."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "transaction_id": {
                            "type": "STRING",
                            "description": "id from the recent transactions list",
                        },
                        "category": {"type": "STRING"},
                        "track_name": {"type": "STRING"},
                        "amount_rupees": {"type": "NUMBER"},
                        "description": {"type": "STRING"},
                        "occurred_on": {"type": "STRING", "description": "ISO YYYY-MM-DD"},
                        "note": {"type": "STRING"},
                    },
                    "required": ["transaction_id"],
                },
            },
            {
                "name": "rename_category",
                "description": (
                    "Rename an existing category, carrying the change through every past "
                    "entry. If the new name already exists this MERGES into it instead. Use "
                    "for \"rename Other to Salary\" or \"move everything from Food to Eating Out\"."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "current_name": {"type": "STRING"},
                        "new_name": {"type": "STRING"},
                    },
                    "required": ["current_name", "new_name"],
                },
            },
            {
                "name": "create_category",
                "description": (
                    "Create a NEW expense category. Only when the user explicitly asks for one, "
                    "or when an expense genuinely fits none of the existing categories. Prefer an "
                    "existing category almost always."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING", "description": "Short, singular, title case"},
                    },
                    "required": ["name"],
                },
            },
            {
                "name": "set_bank_balance",
                "description": (
                    "Record what the user's bank account actually holds right now. Use when "
                    "they state a current balance: \"my account has 84 thousand\"."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "rupees": {"type": "NUMBER"},
                        "as_of": {"type": "STRING", "description": "ISO YYYY-MM-DD. Today if unstated."},
                    },
                    "required": ["rupees"],
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
    image_base64: str | None,
    mime_type: str | None,
    existing_tracks: list[dict],
    categories: list[str],
    recent_transactions: list[dict] | None = None,
    today: str | None = None,
    timezone: str | None = None,
) -> tuple[list[dict], str, str]:
    """
    Turn an instruction into a list of intended function calls.

    Returns (actions, reply, transcript).

    Returns (actions, reply). Nothing is executed here - the caller sends these
    back to the client, which confirms them and applies them through its own
    write path. The backend deliberately holds no Firestore write credentials.
    """
    parts: list[types.Part] = []

    if image_base64:
        import base64

        parts.append(
            types.Part.from_bytes(
                data=base64.b64decode(image_base64), mime_type=mime_type or "image/jpeg"
            )
        )
        parts.append(types.Part.from_text(text="Record the expense on this receipt."))
    elif audio_base64:
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

    # Enough to identify an entry the user is referring to, and no more - the
    # planner never needs the whole ledger.
    recent_summary = (
        "\n".join(
            f"- id={t.get('id')} | {t.get('date')} | {t.get('description')} | "
            f"Rs {t.get('amount')} | {t.get('category')}"
            for t in (recent_transactions or [])
        )
        or "- (none yet)"
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            system_instruction=(
                f"{PLAN_SYSTEM}\n\n"
                # The CLIENT's date, not the server's. Cloud Run runs UTC, so
                # date.today() here reads as yesterday for the whole 00:00-05:29
                # IST window - which would mis-resolve "today" and "yesterday",
                # and at a month boundary file the expense under the wrong month.
                f"Today is {today or date.today().isoformat()}"
                + (f" in the user's timezone ({timezone})." if timezone else ".")
                + f"\n\nExisting tracks:\n{track_summary}\n\n"
                f"Valid expense categories: {', '.join(categories)}"
            ),
            tools=TOOLS,
            temperature=0,
        ),
    )

    actions: list[dict] = []
    reply_parts: list[str] = []
    transcript = ""

    candidates = response.candidates or []
    for part in (candidates[0].content.parts if candidates and candidates[0].content else []):
        call = getattr(part, "function_call", None)
        if call and call.name:
            args = dict(call.args or {})
            # heard() is not an action - it is the transcript, surfaced separately.
            if call.name == "heard":
                transcript = str(args.get("transcript") or "").strip()
                continue
            actions.append({"tool": call.name, "args": args})
        elif getattr(part, "text", None):
            reply_parts.append(part.text)

    if len(actions) > MAX_ACTIONS:
        log.warning("Truncating %d actions to %d", len(actions), MAX_ACTIONS)
        actions = actions[:MAX_ACTIONS]

    return actions, " ".join(reply_parts).strip(), transcript
