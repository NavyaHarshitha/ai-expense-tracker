"""
Per-user rate limiting and prompt-input caps.

The service is deployed --allow-unauthenticated because the browser calls it
directly, and the only guard is a valid Firebase ID token. But Google sign-in is
open: anyone with a Google account can sign in to this app and obtain a real,
valid token. Authentication proves who you are, not that you are welcome to
spend the project's Vertex AI credits.

So a token alone must not buy unlimited model calls. Each model-backed route is
metered per uid with a token bucket: a steady refill rate plus a burst
allowance, so ordinary use - a handful of expenses logged in quick succession -
never trips it, while a script in a loop stops within seconds.

One honest limitation: this is per-instance memory, not shared state. With N
Cloud Run instances the effective ceiling is N x the limit. For a personal app
pinned to a low max-instances that is proportionate, and it is the difference
between "a runaway loop costs a rupee" and "a runaway loop costs the budget".
Moving to Redis or Firestore would make it exact, and is the documented upgrade
path rather than a pretence that this is already exact.
"""

import time
from collections import OrderedDict
from dataclasses import dataclass, field

from fastapi import HTTPException

# A model call is not free, so the ceiling is generous for a person and hostile
# to a loop: 20 in a burst, refilling at 1 every 6 seconds (10/min sustained).
BURST = 20
REFILL_PER_SECOND = 1 / 6

# Bound the bookkeeping itself, so the limiter cannot become the memory leak.
MAX_TRACKED_USERS = 10_000


@dataclass
class _Bucket:
    tokens: float = BURST
    updated: float = field(default_factory=time.monotonic)


_buckets: OrderedDict[str, _Bucket] = OrderedDict()


def check_rate(uid: str, cost: float = 1.0) -> None:
    """Consume one unit of a user's allowance, or raise 429."""
    now = time.monotonic()
    bucket = _buckets.get(uid)

    if bucket is None:
        bucket = _Bucket()
        _buckets[uid] = bucket
        # Evict the least recently used, not an arbitrary one.
        while len(_buckets) > MAX_TRACKED_USERS:
            _buckets.popitem(last=False)
    else:
        _buckets.move_to_end(uid)
        elapsed = now - bucket.updated
        bucket.tokens = min(BURST, bucket.tokens + elapsed * REFILL_PER_SECOND)

    bucket.updated = now

    if bucket.tokens < cost:
        retry_after = max(1, int((cost - bucket.tokens) / REFILL_PER_SECOND))
        raise HTTPException(
            status_code=429,
            detail="Too many requests - give it a few seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    bucket.tokens -= cost


# ---------------------------------------------------------------------------
# Prompt input caps
# ---------------------------------------------------------------------------

# Every one of these lands in the prompt, and tokens are billed. The client
# sends far less than any of them; the caps exist for a caller that does not.
MAX_TEXT_CHARS = 2_000
MAX_TRACKS = 60
MAX_RECENT = 40
MAX_CATEGORIES = 80


def clamp_text(value: str | None, limit: int = MAX_TEXT_CHARS) -> str | None:
    """Truncate rather than reject: a long instruction is clumsy, not hostile."""
    if value is None:
        return None
    return value[:limit]


def clamp_list(values: list, limit: int) -> list:
    return values[:limit]
