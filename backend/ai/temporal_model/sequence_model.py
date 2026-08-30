"""
Temporal model (LSTM / GRU / Transformer) — interface skeleton.

Expected real implementation: consumes a short window of per-frame HAR
predictions (ai/har/har_model.py) and smooths/disambiguates them into a
single stable activity label — this is what turns "60% pour_liquid this
frame, 55% mix next frame" per-frame noise into a clean, FSM-ready activity
stream. See backend/ai/README.md.
"""

from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional


@dataclass
class TemporalPrediction:
    activity: str
    confidence: float


class TemporalSequenceModel:
    def __init__(self, window_size: int = 16, model_path: str = "models/kriya_sense_temporal.onnx"):
        self.window_size = window_size
        self.model_path = model_path
        self._model = None  # TODO: load the trained LSTM/GRU/Transformer
        self._window: Deque[Dict[str, float]] = deque(maxlen=window_size)

    def push_frame(self, frame_prediction: Dict[str, float]) -> None:
        self._window.append(frame_prediction)

    def predict(self) -> Optional[TemporalPrediction]:
        """Return the smoothed activity for the current window, or None until the window fills.

        A trained LSTM/GRU/Transformer replaces this. Intentionally no
        naive fallback (e.g. majority vote) — so it stays obvious in
        testing whether the real model is actually wired up yet.
        """
        if len(self._window) < self.window_size:
            return None
        raise NotImplementedError("Train the temporal model on labeled activity sequences — see backend/ai/README.md")
