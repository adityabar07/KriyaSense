"""
REST + WebSocket routes for the KRIYA-SENSE mock API.

Every handler here returns mock/randomized data with the exact JSON shape
the frontend already expects from frontend/js/api.js. Replace the body of
each handler with a call into the real pipeline as each stage is built:

    /api/detections  -> ai/yolo
    /api/pose        -> ai/pose
    /api/tracking    -> ai/tracking
    /api/activity    -> ai/har + ai/temporal_model
    /api/experiment  -> experiment/fsm.py + experiment/validator.py
    /ws/ai-stream    -> the full pipeline, pushed frame-by-frame
"""

import asyncio
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from . import state

router = APIRouter()


@router.get("/health")
def health_check():
    """Unprefixed on purpose — this is what Render's health check hits."""
    return {"status": "healthy"}


@router.get("/api/status")
def get_status():
    return {"status": "ok", "mode": "BACKEND_PLACEHOLDER", "analysis_running": state.ANALYSIS_RUNNING}


@router.get("/api/activity")
def get_activity():
    frame = state.mock_frame()
    return {"activity": frame["activity"], "confidence": frame["confidence"], "person_count": frame["person_count"]}


@router.get("/api/detections")
def get_detections():
    return state.mock_frame()["objects"]


@router.get("/api/pose")
def get_pose():
    return state.mock_frame()["pose"]


@router.get("/api/tracking")
def get_tracking():
    frame = state.mock_frame()
    tracks = [{"id": "PERSON #01", "type": "person", "confidence": frame["confidence"]}]
    tracks += [
        {"id": f"OBJECT #0{o['track_id']}", "type": o["name"], "confidence": o["confidence"]}
        for o in frame["objects"]
    ]
    return tracks


@router.get("/api/experiment")
def get_experiment():
    return state.experiment_state


@router.get("/api/events")
def get_events():
    return state.event_log


@router.get("/api/system")
def get_system():
    return state.mock_system_metrics()


@router.post("/api/analysis/start")
def start_analysis():
    state.ANALYSIS_RUNNING = True
    return {"status": "started"}


@router.post("/api/analysis/stop")
def stop_analysis():
    state.ANALYSIS_RUNNING = False
    return {"status": "stopped"}


class ExperimentCreateRequest(BaseModel):
    name: str
    steps: List[str]


@router.post("/api/experiment/create")
def create_experiment(payload: ExperimentCreateRequest):
    state.experiment_state["name"] = payload.name
    state.experiment_state["sequence"] = payload.steps
    state.experiment_state["total_steps"] = len(payload.steps)
    state.experiment_state["current_step"] = 1
    state.experiment_state["expected"] = payload.steps[0] if payload.steps else None
    state.experiment_state["detected"] = None
    state.experiment_state["status"] = "VALID"
    return {"status": "created", "experiment": state.experiment_state}


@router.post("/api/experiment/reset")
def reset_experiment():
    state.experiment_state["current_step"] = 1
    state.experiment_state["status"] = "VALID"
    state.experiment_state["expected"] = state.experiment_state["sequence"][0] if state.experiment_state["sequence"] else None
    state.experiment_state["detected"] = None
    return {"status": "reset", "experiment": state.experiment_state}


# ---------------------------------------------------------------------------
# WebSocket stream — future home of the live pipeline output
# ---------------------------------------------------------------------------

@router.websocket("/ws/ai-stream")
async def ws_ai_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            if state.ANALYSIS_RUNNING:
                await websocket.send_json(state.mock_frame())
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
