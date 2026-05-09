#!/bin/bash
# Start both the Next.js app (internal port 3000) and the Python/FastAPI app ($PORT).
# FastAPI proxies /next/* to Next.js; everything else is handled by FastAPI directly.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[start] Starting Next.js on port 3000..."
(cd "$SCRIPT_DIR/web" && PORT=3000 npm start) &

echo "[start] Starting FastAPI on port ${PORT:-8001}..."
exec uvicorn api:app --host 0.0.0.0 --port "${PORT:-8001}"
