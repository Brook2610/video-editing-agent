from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncIterator, Dict, Optional

_loop: Optional[asyncio.AbstractEventLoop] = None
_queues: Dict[str, asyncio.Queue[Dict[str, Any]]] = {}


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def _get_queue(session_id: str) -> asyncio.Queue[Dict[str, Any]]:
    if session_id not in _queues:
        _queues[session_id] = asyncio.Queue()
    return _queues[session_id]


def emit(session_id: str, event: str, data: Dict[str, Any]) -> bool:
    if _loop is None:
        return False
    payload = {
        "event": event,
        "data": data,
        "updated": int(time.time() * 1000),
    }
    queue = _get_queue(session_id)
    _loop.call_soon_threadsafe(queue.put_nowait, payload)
    return True


async def stream(session_id: str) -> AsyncIterator[str]:
    queue = _get_queue(session_id)
    while True:
        try:
            payload = await asyncio.wait_for(queue.get(), timeout=15)
            event = payload.get("event", "message")
            data = json.dumps(payload, ensure_ascii=False)
            yield f"event: {event}\n" f"data: {data}\n\n"
        except asyncio.TimeoutError:
            # keepalive
            yield "event: ping\ndata: {}\n\n"
