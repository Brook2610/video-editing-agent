from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from agent import run_agent
from tools import PROJECTS_ROOT

# Initialize App
app = FastAPI(title="Video Editing Agent")

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"
TEMPLATES = Jinja2Templates(directory=str(WEB_DIR / "templates"))

app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")

# Helper Functions
def _sanitize_session(name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "-", name.strip())
    return safe.strip("-") or "session"


def _session_dir(session_id: str) -> Path:
    return (PROJECTS_ROOT / session_id).resolve()


def _assets_dir(session_id: str) -> Path:
    """Returns the public/assets directory for Remotion compatibility."""
    return _session_dir(session_id) / "public" / "assets"


def _outputs_dir(session_id: str) -> Path:
    """Returns the out directory where Remotion renders videos."""
    return _session_dir(session_id) / "out"


def _ensure_session(session_id: str) -> Path:
    session_dir = _session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    _assets_dir(session_id).mkdir(parents=True, exist_ok=True)
    return session_dir


def _list_sessions() -> List[str]:
    if not PROJECTS_ROOT.exists():
        return []
    sessions = []
    for entry in PROJECTS_ROOT.iterdir():
        if entry.is_dir() and not entry.name.startswith("."):
            sessions.append(entry.name)
    return sorted(sessions)


def _memory_path(session_id: str) -> Path:
    return _session_dir(session_id) / ".memory.jsonl"


def _read_messages(session_id: str) -> List[Dict[str, Any]]:
    path = _memory_path(session_id)
    if not path.exists():
        return []
    items = []
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not line.strip():
                continue
            items.append(json.loads(line))
    except Exception:
        return []

    messages: List[Dict[str, Any]] = []
    for msg in items:
        role = msg.get("type") or msg.get("role") or "ai"
        payload = msg.get("data", {}) if isinstance(msg, dict) else {}
        content = payload.get("content", "")
        if isinstance(content, list):
            text_parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
            text = "\n".join([p for p in text_parts if p])
        else:
            text = str(content)
        messages.append({"role": role, "text": text})
    return messages


def _list_assets(session_id: str) -> List[Dict[str, Any]]:
    assets = _assets_dir(session_id)
    if not assets.exists():
        return []
    results: List[Dict[str, Any]] = []
    for path in assets.rglob("*"):
        if path.is_file():
            results.append({
                "name": str(path.relative_to(assets)),
                "size": path.stat().st_size,
            })
    return sorted(results, key=lambda item: item["name"])


def _list_outputs(session_id: str) -> List[Dict[str, Any]]:
    outputs = _outputs_dir(session_id)
    if not outputs.exists():
        return []
    results: List[Dict[str, Any]] = []
    for path in outputs.rglob("*"):
        if path.is_file():
            stat = path.stat()
            results.append({
                "name": str(path.relative_to(outputs)),
                "size": stat.st_size,
                "modified": int(stat.st_mtime * 1000),  # milliseconds timestamp
            })
    return sorted(results, key=lambda item: item["modified"], reverse=True)  # newest first


def _save_upload(session_id: str, upload: UploadFile) -> Path:
    _ensure_session(session_id)
    assets = _assets_dir(session_id)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "-", upload.filename or "upload")
    target = assets / f"{timestamp}_{safe_name}"
    with target.open("wb") as handle:
        handle.write(upload.file.read())
    return target

# Routes
@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return TEMPLATES.TemplateResponse("index.html", {"request": request})


@app.get("/api/sessions")
def get_sessions() -> JSONResponse:
    return JSONResponse({"sessions": _list_sessions()})


@app.post("/api/sessions")
def create_session(name: Optional[str] = Form(None)) -> JSONResponse:
    session_id = _sanitize_session(name or "")
    if not session_id:
        session_id = "session"
    if session_id in _list_sessions():
        session_id = f"{session_id}-{datetime.utcnow().strftime('%H%M%S')}"
    _ensure_session(session_id)
    return JSONResponse({"session": session_id})


@app.get("/api/sessions/{session_id}/messages")
def get_messages(session_id: str) -> JSONResponse:
    return JSONResponse({"messages": _read_messages(session_id)})


@app.get("/api/sessions/{session_id}/assets")
def get_assets(session_id: str) -> JSONResponse:
    return JSONResponse({"assets": _list_assets(session_id)})


@app.get("/api/sessions/{session_id}/outputs")
def get_outputs(session_id: str) -> JSONResponse:
    return JSONResponse({"outputs": _list_outputs(session_id)})


@app.get("/api/sessions/{session_id}/assets/{filename:path}")
def get_asset_file(session_id: str, filename: str) -> Any:
    assets_dir = _assets_dir(session_id)
    file_path = (assets_dir / filename).resolve()
    if not str(file_path).startswith(str(assets_dir.resolve())):
        return JSONResponse({"error": "Access denied"}, status_code=403)
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    
    # Add proper headers for video streaming
    return FileResponse(
        file_path,
        media_type="video/mp4" if file_path.suffix.lower() in ['.mp4', '.mov'] else None,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )


@app.post("/api/sessions/{session_id}/message")
def send_message(
    session_id: str,
    message: str = Form(...),
    asset_names: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
) -> JSONResponse:
    _ensure_session(session_id)

    selected_assets: List[str] = []
    if asset_names:
        try:
            parsed = json.loads(asset_names)
            if isinstance(parsed, list):
                selected_assets.extend(parsed)
        except json.JSONDecodeError:
            pass

    saved_assets: List[str] = []
    for upload in files:
        saved = _save_upload(session_id, upload)
        saved_assets.append(str(saved))

    assets_dir = _assets_dir(session_id)
    for asset in selected_assets:
        target = (assets_dir / asset).resolve()
        if str(target).lower().startswith(str(assets_dir).lower()) and target.exists():
            saved_assets.append(str(target))

    response_text = run_agent(
        video_source="none",
        request=message,
        project=session_id,
        model=os.getenv("GEMINI_MODEL", "gemini-3-flash-preview"),
        max_steps=int(os.getenv("AGENT_MAX_STEPS", "100")),
        assets=saved_assets or None,
    )

    return JSONResponse({"reply": response_text})


@app.get("/api/sessions/{session_id}/outputs/{filename:path}")
def get_output_file(session_id: str, filename: str) -> Any:
    outputs_dir = _outputs_dir(session_id)
    file_path = (outputs_dir / filename).resolve()
    if not str(file_path).startswith(str(outputs_dir.resolve())):
        return JSONResponse({"error": "Access denied"}, status_code=403)
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    
    # Disable caching for output files so updates are always fresh
    return FileResponse(
        file_path,
        media_type="video/mp4" if file_path.suffix.lower() in ['.mp4', '.mov'] else None,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@app.post("/api/sessions/{session_id}/assets/delete")
def delete_assets(
    session_id: str,
    asset_names: List[str] = Form(...),
) -> JSONResponse:
    assets_dir = _assets_dir(session_id)
    if not assets_dir.exists():
        return JSONResponse({"success": False, "error": "Session assets not found"}, status_code=404)

    deleted = []
    errors = []

    for name in asset_names:
        # Prevent directory traversal
        if ".." in name or name.startswith("/"):
            errors.append(f"Invalid path: {name}")
            continue
            
        target = (assets_dir / name).resolve()
        
        # Ensure target is within assets dir
        if not str(target).startswith(str(assets_dir.resolve())):
             errors.append(f"Access denied: {name}")
             continue
             
        if target.exists() and target.is_file():
            try:
                target.unlink()
                deleted.append(name)
            except Exception as e:
                errors.append(f"Failed to delete {name}: {str(e)}")
        else:
            errors.append(f"File not found: {name}")

    return JSONResponse({"deleted": deleted, "errors": errors})


@app.post("/api/sessions/{session_id}/assets/upload")
def upload_assets(
    session_id: str,
    files: List[UploadFile] = File(...),
) -> JSONResponse:
    _ensure_session(session_id)
    saved_files = []
    for upload in files:
        saved = _save_upload(session_id, upload)
        saved_files.append(saved.name)
    return JSONResponse({"uploaded": saved_files})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)