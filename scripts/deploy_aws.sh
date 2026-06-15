#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/video-editing-agent"
BRANCH="${VIDEO_AGENT_BRANCH:-modification-branch}"

cd "$APP_DIR"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip wheel
.venv/bin/pip install -r requirements.txt

sudo systemctl restart video-editing-agent
sudo systemctl reload nginx

echo "Deployed $(git rev-parse --short HEAD) from $BRANCH at $(date -Is)"
