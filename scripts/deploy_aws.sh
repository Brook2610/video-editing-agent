#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/video-editing-agent"
BRANCH="${VIDEO_AGENT_BRANCH:-modification-branch}"
APP_USER="ubuntu"

as_app_user() {
  if [ "$(id -u)" -eq 0 ]; then
    sudo -u "$APP_USER" -H "$@"
  else
    "$@"
  fi
}

cd "$APP_DIR"

as_app_user git -C "$APP_DIR" fetch origin "$BRANCH"
as_app_user git -C "$APP_DIR" reset --hard "origin/$BRANCH"

if [ ! -d .venv ]; then
  as_app_user python3 -m venv .venv
fi

as_app_user "$APP_DIR/.venv/bin/pip" install --upgrade pip wheel
as_app_user "$APP_DIR/.venv/bin/pip" install -r requirements.txt

sudo systemctl restart video-editing-agent
sudo systemctl reload nginx

echo "Deployed $(git rev-parse --short HEAD) from $BRANCH at $(date -Is)"
