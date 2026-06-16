#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  git \
  nginx \
  python3 \
  python3-pip \
  python3-venv \
  ffmpeg \
  build-essential \
  libnss3 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libgtk-3-0 \
  libasound2t64

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

APP_DIR=/opt/video-editing-agent
APP_USER=ubuntu

rm -rf "$APP_DIR"
git clone --branch modification-branch --depth 1 https://github.com/Brook2610/video-editing-agent.git "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

sudo -u "$APP_USER" python3 -m venv "$APP_DIR/.venv"
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install --upgrade pip wheel
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"

cat > "$APP_DIR/.env" <<'EOF'
GEMINI_MODEL=gemini-3-flash-preview
AGENT_MAX_STEPS=100
MAX_UPLOAD_FILE_MB=200
MAX_SESSION_ASSET_MB=500
MAX_FILES_PER_UPLOAD=10
MAX_FILES_PER_SESSION=50
MAX_PROMPTS_PER_IP_PER_HOUR=15
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

cat > /etc/systemd/system/video-editing-agent.service <<'EOF'
[Unit]
Description=Video Editing Agent FastAPI app
After=network-online.target
Wants=network-online.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/video-editing-agent
EnvironmentFile=/opt/video-editing-agent/.env
ExecStart=/opt/video-editing-agent/.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 --workers 1 --timeout-keep-alive 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/video-editing-agent <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 500M;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;
    proxy_connect_timeout 60s;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/video-editing-agent /etc/nginx/sites-enabled/video-editing-agent
nginx -t

systemctl daemon-reload
systemctl enable video-editing-agent
systemctl restart video-editing-agent
systemctl enable nginx
systemctl restart nginx

cat > /opt/video-editing-agent/DEPLOYED_FROM.txt <<EOF
repo=https://github.com/Brook2610/video-editing-agent.git
branch=modification-branch
deployed_at=$(date -Is)
EOF
chown "$APP_USER:$APP_USER" /opt/video-editing-agent/DEPLOYED_FROM.txt
