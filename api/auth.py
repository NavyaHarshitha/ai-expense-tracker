"""
Firebase ID token verification.

The service is deployed --allow-unauthenticated because the browser calls it
directly, so this is the only thing standing between the internet and a Gemini
endpoint billed to our credits. Every route depends on it.
"""

import logging

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth as fb_auth

log = logging.getLogger(__name__)

# Uses the Cloud Run service account's default credentials.
firebase_admin.initialize_app()


async def require_user(authorization: str | None = Header(default=None)) -> str:
    """Return the caller's uid, or raise 401. Used as a FastAPI dependency."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        claims = fb_auth.verify_id_token(token)
    except Exception as exc:
        # Deliberately vague to the caller, specific in the logs. Never echo the
        # token or the reason back - that only helps someone probing the endpoint.
        log.warning("Token verification failed: %s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    uid = claims.get("uid") or claims.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Token has no subject")

    return uid
