"""
Shared in-memory placeholder state for the mock API layer.

Once real AI stages exist, this module is what gets replaced: `mock_frame()`
is the single place a real pipeline output (from ai/yolo, ai/pose,
ai/tracking, ai/har, ai/temporal_model) would be assembled into the same
JSON shape the frontend already consumes.
"""

import random
from datetime import datetime, timezone
from typing import List, Optional, TypedDict


class TrackedObject(TypedDict):
    name: str
    confidence: float
    track_id: int


ANALYSIS_RUNNING = True

DEFAULT_SEQUENCE = ["PICK_UP", "OPEN_CAP", "DRAW_LIQUID", "POUR_LIQUID", "MIX", "PLACE_BACK"]

experiment_state = {
    "name": "BAS Chemical Handling Protocol",
    "sequence": DEFAULT_SEQUENCE,
    "current_step": 1,
    "total_steps": len(DEFAULT_SEQUENCE),
    "expected": "PICK UP",
    "detected": None,
    "status": "VALID",
}

event_log: List[dict] = []

OBJECT_POOL = [
    {"name": "CHEMICAL_BOTTLE", "base": 98.1},
    {"name": "TEST_TUBE", "base": 96.8},
    {"name": "SYRINGE", "base": 95.4},
    {"name": "PIPETTE", "base": 94.6},
    {"name": "PETRI_DISH", "base": 97.2},
]


def jitter(base: float, spread: float = 2.0) -> float:
    return round(max(0.0, min(100.0, base + random.uniform(-spread, spread))), 1)


def mock_frame() -> dict:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "person_count": 1,
        "activity": "WALKING",
        "confidence": jitter(96.4),
        "objects": [
            {"name": o["name"], "confidence": jitter(o["base"], 1.2), "track_id": 14 + i}
            for i, o in enumerate(OBJECT_POOL)
        ],
        "pose": {"confidence": jitter(97.2, 1.0), "keypoints": 33},
        "hands": {"left": None, "right": None},
        "experiment": experiment_state,
    }


def mock_system_metrics() -> dict:
    return {
        "cpu": jitter(42, 8),
        "gpu": jitter(68, 6),
        "ram": jitter(61, 5),
        "vram": jitter(54, 6),
        "inference_fps": round(jitter(30, 1)),
        "latency_ms": round(jitter(42, 6)),
        "yolo_fps": round(jitter(31, 1)),
        "pose_fps": round(jitter(30, 1)),
        "har_fps": round(jitter(28, 1)),
        "model": "HAR-v1.0",
        "temporal_model": "LSTM",
        "device": "EDGE AI DEVICE",
    }
