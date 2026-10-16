#!/usr/bin/env bash
# Runs the whole app locally: the AI service on :8080 and the client on :5173.
# Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/api/.env" ]; then
  echo "Missing api/.env - create it with: GEMINI_API_KEY=your-key" >&2
  exit 1
fi
if [ ! -x "$ROOT/api/.venv/bin/uvicorn" ]; then
  echo "Missing api/.venv - create it with:" >&2
  echo "  python3 -m venv api/.venv && api/.venv/bin/pip install -r api/requirements.txt" >&2
  exit 1
fi

(
  cd "$ROOT/api"
  set -a; . ./.env; set +a
  exec .venv/bin/uvicorn main:app --port 8080
) &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null' EXIT

cd "$ROOT/app"
npm run dev
