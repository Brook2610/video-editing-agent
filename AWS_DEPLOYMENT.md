# Video Editing Agent AWS Deployment

## Current Deployment

- AWS account: `460294045578`
- AWS region: `us-east-1`
- Service: EC2
- Instance name: `video-editing-agent`
- Instance ID: `i-00057e17c9458f370`
- Instance type: `t3.small`
- Root disk: 30 GB `gp3`
- Public IP: `100.58.230.206`
- App URL: `http://100.58.230.206/`
- GitHub repo: `https://github.com/Brook2610/video-editing-agent`
- Deployed branch: `modification-branch`
- Runtime directory: `/opt/video-editing-agent`
- Service: `video-editing-agent.service`
- Reverse proxy: Nginx on port `80`

## Runtime Stack

- Ubuntu 24.04
- Python virtualenv at `/opt/video-editing-agent/.venv`
- FastAPI served by Uvicorn on `127.0.0.1:8000`
- Nginx proxies public port `80` to Uvicorn
- Node.js 20
- npm
- ffmpeg / ffprobe

## Security Group

- Security group: `sg-0075a86f9d082d1ff`
- HTTP `80`: currently restricted to Brook's current IP while the app has no auth
- SSH `22`: initially restricted during manual setup; GitHub Actions deployment may require broader SSH or an OIDC/SSM deployment path

Do not open HTTP publicly until auth/rate limits/upload controls are added.

## Environment Variables

Configured in:

```text
/opt/video-editing-agent/.env
```

The file is mode `600` and owned by `ubuntu`. Secrets are intentionally not written here.

Expected keys:

- `GOOGLE_API_KEY_PREMIUM_VIDEO_EDITOR`
- `GOOGLE_API_KEY_PREMIUM`
- `GOOGLE_API_KEY`
- `LANGSMITH_API_KEY`
- `GEMINI_MODEL=gemini-3-flash-preview`
- `AGENT_MAX_STEPS=100`

## Deploy From GitHub

Manual deploy on the instance:

```bash
bash /opt/video-editing-agent/scripts/deploy_aws.sh
```

The deploy script:

- fetches `origin/modification-branch`
- resets the VM checkout to that branch
- installs Python dependencies
- restarts `video-editing-agent.service`
- reloads Nginx

GitHub Actions workflow:

```text
.github/workflows/deploy-aws.yml
```

Required GitHub secrets:

- `VIDEO_AGENT_HOST`
- `VIDEO_AGENT_USER`
- `VIDEO_AGENT_SSH_KEY`
- `VIDEO_AGENT_KNOWN_HOSTS`

## Verified Checks

After initial deployment:

- `GET /` returned HTTP `200`
- `GET /api/sessions` returned HTTP `200` with `{"sessions":[]}`
- `GET /static/app.js` returned HTTP `200`
- `video-editing-agent.service` was active
- `nginx` was active
- Root disk had about 25 GB free after setup

## Known Gaps Before Public Launch

- No authentication yet
- No rate limits yet
- Upload and render abuse controls still needed
- No custom HTTPS domain yet
- No automated backup for `/opt/video-editing-agent/projects`
- No cleanup policy for old uploaded assets/renders

Recommended next hardening pass:

1. Add login/basic auth before opening HTTP publicly.
2. Add upload size/count limits in the app and Nginx.
3. Add project/output cleanup policy.
4. Add HTTPS via CloudFront and a subdomain, similar to News Claw.
5. Add S3 backups or sync for `projects/` if outputs need to persist.
