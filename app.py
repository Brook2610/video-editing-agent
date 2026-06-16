from __future__ import annotations

import json
import os
import re
from datetime import datetime
import asyncio
import uuid
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import shutil

try:
    from agent import run_agent
    import events
    from tools import PROJECTS_ROOT
except ModuleNotFoundError:
    # Fallback for launch contexts where this file's directory isn't on sys.path.
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from agent import run_agent
    import events
    from tools import PROJECTS_ROOT

# Initialize App
app = FastAPI(title="Video Editing Agent")

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates" / "remotion-base"
WEB_DIR = BASE_DIR / "web"
TEMPLATES = Jinja2Templates(directory=str(WEB_DIR / "templates"))

MB = 1024 * 1024
MAX_UPLOAD_FILE_BYTES = int(os.getenv("MAX_UPLOAD_FILE_MB", "200")) * MB
MAX_SESSION_ASSET_BYTES = int(os.getenv("MAX_SESSION_ASSET_MB", "500")) * MB
MAX_FILES_PER_UPLOAD = int(os.getenv("MAX_FILES_PER_UPLOAD", "10"))
MAX_FILES_PER_SESSION = int(os.getenv("MAX_FILES_PER_SESSION", "50"))
MAX_PROMPTS_PER_IP_PER_HOUR = int(os.getenv("MAX_PROMPTS_PER_IP_PER_HOUR", "15"))
ALLOWED_UPLOAD_EXTENSIONS = {
    ext.strip().lower()
    for ext in os.getenv(
        "ALLOWED_UPLOAD_EXTENSIONS",
        ".mp4,.mov,.webm,.mp3,.wav,.m4a,.jpg,.jpeg,.png",
    ).split(",")
    if ext.strip()
}
PROMPT_RATE_WINDOW_SECONDS = 60 * 60
MODEL_OPTIONS = {
    "kimi": "Kimi-K2.6-1",
    "gpt55": "gpt-5.5",
    "Kimi-K2.6-1": "Kimi-K2.6-1",
    "gpt-5.5": "gpt-5.5",
}

_job_lock = Lock()
_job_started_at: Optional[float] = None
_prompt_rate_lock = Lock()
_prompt_rate_by_ip: Dict[str, deque[float]] = defaultdict(deque)

app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")


@app.on_event("startup")
async def _startup() -> None:
    events.set_loop(asyncio.get_running_loop())

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


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                continue
    return total


def _file_count(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for item in path.rglob("*") if item.is_file())


def _limits_payload() -> Dict[str, Any]:
    return {
        "max_upload_file_mb": MAX_UPLOAD_FILE_BYTES // MB,
        "max_session_asset_mb": MAX_SESSION_ASSET_BYTES // MB,
        "max_files_per_upload": MAX_FILES_PER_UPLOAD,
        "max_files_per_session": MAX_FILES_PER_SESSION,
        "max_prompts_per_ip_per_hour": MAX_PROMPTS_PER_IP_PER_HOUR,
        "max_concurrent_jobs": 1,
        "allowed_upload_extensions": sorted(ALLOWED_UPLOAD_EXTENSIONS),
    }


def _validate_upload_batch_or_response(session_id: str, files: List[UploadFile]) -> Optional[JSONResponse]:
    if len(files) > MAX_FILES_PER_UPLOAD:
        return JSONResponse(
            {"error": f"Too many files. Maximum {MAX_FILES_PER_UPLOAD} files per upload."},
            status_code=413,
        )

    assets = _assets_dir(session_id)
    existing_count = _file_count(assets)
    if existing_count + len(files) > MAX_FILES_PER_SESSION:
        return JSONResponse(
            {"error": f"Session file limit exceeded. Maximum {MAX_FILES_PER_SESSION} asset files per session."},
            status_code=413,
        )

    for upload in files:
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
            return JSONResponse(
                {
                    "error": (
                        f"Unsupported file type '{suffix or 'unknown'}'. "
                        f"Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}"
                    )
                },
                status_code=415,
            )
    return None


def _check_prompt_rate_or_response(request: Request) -> Optional[JSONResponse]:
    client_ip = _client_ip(request)
    now = monotonic()
    with _prompt_rate_lock:
        timestamps = _prompt_rate_by_ip[client_ip]
        while timestamps and now - timestamps[0] > PROMPT_RATE_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= MAX_PROMPTS_PER_IP_PER_HOUR:
            return JSONResponse(
                {
                    "error": (
                        f"Demo prompt limit reached for this IP. "
                        f"Maximum {MAX_PROMPTS_PER_IP_PER_HOUR} prompts per hour."
                    )
                },
                status_code=429,
            )
        timestamps.append(now)
    return None


def _ensure_session(session_id: str) -> Path:
    session_dir = _session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    _assets_dir(session_id).mkdir(parents=True, exist_ok=True)
    _scaffold_project(session_dir)
    return session_dir


def _scaffold_project(session_dir: Path) -> None:
    """Copy Remotion template files to project if package.json doesn't exist."""
    if (session_dir / "package.json").exists():
        return
    if not TEMPLATES_DIR.exists():
        return
    for item in TEMPLATES_DIR.rglob("*"):
        if item.is_file():
            rel = item.relative_to(TEMPLATES_DIR)
            target = session_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(item, target)


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
    allowed_roles = {"human", "user", "ai", "assistant"}
    for msg in items:
        role = msg.get("type") or msg.get("role") or "ai"
        if role not in allowed_roles:
            continue
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
        if role in {"human", "user"}:
            lines = text.splitlines()
            extracted: List[str] = []
            for line in lines:
                if line.startswith("User request:"):
                    extracted.append(line.replace("User request:", "", 1).strip())
                elif line.startswith("Project name:"):
                    continue
                else:
                    extracted.append(line)
            text = "\n".join([line for line in extracted if line]).strip()
        if not text.strip():
            continue
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
    session_size_before = _directory_size(assets)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "-", upload.filename or "upload")
    target = assets / f"{timestamp}_{uuid.uuid4().hex[:8]}_{safe_name}"
    written = 0
    try:
        with target.open("wb") as handle:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_FILE_BYTES:
                    raise ValueError(f"File is too large. Maximum {MAX_UPLOAD_FILE_BYTES // MB} MB per file.")
                if session_size_before + written > MAX_SESSION_ASSET_BYTES:
                    raise ValueError(f"Session asset limit exceeded. Maximum {MAX_SESSION_ASSET_BYTES // MB} MB per session.")
                handle.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        upload.file.close()
    return target

# Routes
@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return TEMPLATES.TemplateResponse(request, "index.html", {"request": request})


@app.get("/api/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "healthy", "limits": _limits_payload()})


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


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str) -> JSONResponse:
    session_dir = _session_dir(session_id)
    root = PROJECTS_ROOT.resolve()
    if not str(session_dir).startswith(str(root)):
        return JSONResponse({"error": "Access denied"}, status_code=403)
    if not session_dir.exists() or not session_dir.is_dir():
        return JSONResponse({"error": "Session not found"}, status_code=404)
    shutil.rmtree(session_dir)
    return JSONResponse({"deleted": session_id})


@app.get("/api/sessions/{session_id}/messages")
def get_messages(session_id: str) -> JSONResponse:
    return JSONResponse({"messages": _read_messages(session_id)})


@app.get("/api/sessions/{session_id}/assets")
def get_assets(session_id: str) -> JSONResponse:
    return JSONResponse({"assets": _list_assets(session_id)})


@app.get("/api/sessions/{session_id}/outputs")
def get_outputs(session_id: str) -> JSONResponse:
    return JSONResponse({"outputs": _list_outputs(session_id)})


@app.get("/api/sessions/{session_id}/events")
def stream_events(session_id: str) -> StreamingResponse:
    return StreamingResponse(
        events.stream(session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    request: Request,
    session_id: str,
    message: str = Form(...),
    model: Optional[str] = Form(None),
    asset_names: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
) -> JSONResponse:
    _ensure_session(session_id)
    rate_error = _check_prompt_rate_or_response(request)
    if rate_error:
        return rate_error

    upload_error = _validate_upload_batch_or_response(session_id, files)
    if upload_error:
        return upload_error

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

    model_choice = (model or "kimi").strip()
    model_name = MODEL_OPTIONS.get(model_choice) or MODEL_OPTIONS.get(model_choice.lower(), "Kimi-K2.6-1")

    global _job_started_at
    if not _job_lock.acquire(blocking=False):
        return JSONResponse(
            {"error": "The demo is currently busy with another edit. Please try again in a few minutes."},
            status_code=409,
        )

    print(f"[video-agent] Using model: {model_name}")
    _job_started_at = monotonic()
    try:
        response_text = run_agent(
            video_source="none",
            request=message,
            project=session_id,
            model=model_name,
            max_steps=int(os.getenv("AGENT_MAX_STEPS", "100")),
            assets=saved_assets or None,
        )
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=413)
    finally:
        _job_started_at = None
        _job_lock.release()

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
    upload_error = _validate_upload_batch_or_response(session_id, files)
    if upload_error:
        return upload_error

    saved_files = []
    try:
        for upload in files:
            saved = _save_upload(session_id, upload)
            saved_files.append(saved.name)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=413)
    return JSONResponse({"uploaded": saved_files})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
