#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
export PYTHONUNBUFFERED=1
# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
