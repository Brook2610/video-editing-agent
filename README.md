# Video Editing Agent

AI-powered video editing assistant with a FastAPI backend and a web UI. It manages per-project assets, runs an agent for editing tasks, and can render outputs.

## Features
- Project/session management
- Asset upload and preview
- Chat-based editing workflow
- Output listing and playback

## Requirements
- Python 3.10+
- Node.js 18+ (for any Remotion-based workflows)
- ffmpeg

## Local Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file:
```
GOOGLE_API_KEY=your_key_here
GEMINI_MODEL=gemini-3-flash-preview
AGENT_MAX_STEPS=100
```

Run the app:
```bash
python app.py
```

Open: http://localhost:8000

## Notes
- Project files live under `projects/` (git-ignored).
- Assets live in `projects/<session>/public/assets`.
- Outputs live in `projects/<session>/out`.
