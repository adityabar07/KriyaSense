"""
YOLO object/person detector — interface skeleton, not a working model.

This module defines the exact input/output contract the rest of the
pipeline (tracking, hand-object interaction, HAR) expects, so a trained
model can be dropped in later without touching any other file. See
backend/ai/README.md for the dataset/training plan.

Expected real implementation: Ultralytics YOLOv8/YOLOv10, fine-tuned on the
KRIYA-SENSE object classes and exported to ONNX for edge inference.
"""

from dataclasses import dataclass
from typing import List


@dataclass
class BBox:
    """Normalized bounding box, 0..1 of frame width/height.

    Same contract as frontend/js/detection.js's mock bboxes — keeping this
    identical is what lets the frontend swap mock -> real data with zero
    changes to overlay.js.
    """
    x: float
    y: float
    width: float
    height: float


@dataclass
class Detection:
    label: str          # "person", "chemical_bottle", "test_tube", "syringe", "pipette", "petri_dish", ...
    confidence: float   # 0..100
    bbox: BBox


class YOLODetector:
    def __init__(self, model_path: str = "models/kriya_sense_yolo.onnx"):
        self.model_path = model_path
        self._model = None  # TODO: ultralytics.YOLO(model_path) or an onnxruntime.InferenceSession

    def load(self) -> None:
        """Load the trained weights. Not callable until a model exists."""
        raise NotImplementedError("Train and export a YOLO model first — see backend/ai/README.md")

    def detect(self, frame) -> List[Detection]:
        """Run inference on a single BGR frame (as returned by cv2.VideoCapture.read()).

        Returns one Detection per person/object found, bbox normalized to
        the frame size.
        """
        raise NotImplementedError("Train and export a YOLO model first — see backend/ai/README.md")
