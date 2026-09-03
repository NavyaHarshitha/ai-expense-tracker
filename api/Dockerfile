FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Requirements first, so a code change doesn't reinstall dependencies.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Cloud Run injects PORT. One worker: the work is IO-bound waiting on Gemini,
# and concurrency is handled by the event loop plus Cloud Run's own --concurrency.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1
