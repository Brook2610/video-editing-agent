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
- Last verified deployed commit: `565f12a`
- Runtime directory: `/opt/video-editing-agent`
- Service: `video-editing-agent.service`
- Reverse proxy: Nginx on port `80`
- SSM managed instance: online

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
- SSH `22`: restricted to Brook's current IPs for manual administration
- GitHub Actions deploys through AWS Systems Manager (SSM), so SSH does not need to be opened for CI/CD

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
- `MAX_UPLOAD_FILE_MB=200`
- `MAX_SESSION_ASSET_MB=500`
- `MAX_FILES_PER_UPLOAD=10`
- `MAX_FILES_PER_SESSION=50`
- `MAX_PROMPTS_PER_IP_PER_HOUR=15`

## Showcase Limits

The app intentionally has no password yet, but it has hard demo limits:

- Maximum upload size: 200 MB per file
- Maximum session asset storage: 500 MB
- Maximum files per upload: 10
- Maximum files per session: 50
- Allowed upload extensions: `.mp4`, `.mov`, `.webm`, `.mp3`, `.wav`, `.m4a`, `.jpg`, `.jpeg`, `.png`
- Maximum prompts: 15 per IP per hour
- Maximum concurrent agent/edit jobs: 1

If another edit is running, the app returns HTTP `409` with:

```text
The demo is currently busy with another edit. Please try again in a few minutes.
```

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

The workflow uses GitHub OIDC to assume this AWS role:

- `arn:aws:iam::460294045578:role/video-editor-agent-github-deploy-role`

AWS IAM resources:

- EC2 SSM role: `video-editor-agent-ec2-ssm-role`
- EC2 instance profile: `video-editor-agent-ec2-ssm-profile`
- GitHub OIDC provider: `arn:aws:iam::460294045578:oidc-provider/token.actions.githubusercontent.com`
- GitHub deploy role: `video-editor-agent-github-deploy-role`

Then it runs this SSM command on the EC2 instance:

```bash
bash /opt/video-editing-agent/scripts/deploy_aws.sh
```

No SSH private key is needed for GitHub Actions.

## Verified Checks

After initial deployment:

- `GET /` returned HTTP `200`
- `GET /api/sessions` returned HTTP `200` with `{"sessions":[]}`
- `GET /api/health` returned HTTP `200` with configured showcase limits
- `GET /static/app.js` returned HTTP `200`
- `video-editing-agent.service` was active
- `nginx` was active
- Root disk had about 25 GB free after setup
- GitHub Actions workflow `Deploy to AWS EC2` completed successfully through SSM after commit `565f12a`.

## Known Gaps Before Public Launch

- No authentication yet
- No password/auth yet by design
- Monthly/daily disk cleanup still needed
- No custom HTTPS domain yet
- No automated backup for `/opt/video-editing-agent/projects`
- No cleanup policy for old uploaded assets/renders

Recommended next hardening pass:

1. Add project/output cleanup policy.
2. Add HTTPS via CloudFront and a subdomain, similar to News Claw.
3. Add S3 backups or sync for `projects/` if outputs need to persist.
4. Reconsider a simple demo password before broad public sharing.
