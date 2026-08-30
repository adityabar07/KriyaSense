"""
HAR (Human Activity Recognition) model — interface skeleton.

Expected real implementation: a lightweight classifier (e.g. an MLP or
small CNN) over per-frame features (pose keypoints + hand-object state),
producing a per-frame activity distribution. Temporal smoothing across
frames is ai/temporal_model's job, not this module's — HARModel only ever
looks at a single frame's features. See backend/ai/README.md.
"""

from dataclasses import dataclass
from typing import Dict, List

from ai.hand_interaction.hand_object import HandObjectState
from ai.pose.pose_estimator import Keypoint

ACTIVITY_CLASSES = [
    # BAS experiment-specific actions (the reference scenario — see README §2)
    "pick_up", "open_cap", "draw_liquid", "pour_liquid", "mix", "place_back",
    # General activities
    "standing", "sitting", "walking", "running", "lying_down", "reading",
    "writing", "using_laptop", "using_phone", "carrying", "reaching",
    # Negative/error classes — see backend/ai/README.md §3.C
    "skip_step", "wrong_sequence", "wrong_object", "premature_action",
]


@dataclass
class FrameFeatures:
    pose: Dict[str, Keypoint]
    hand_object: List[HandObjectState]


class HARModel:
    def __init__(self, model_path: str = "models/astra_har_classifier.onnx"):
        self.model_path = model_path
        self._model = None  # TODO: load the trained classifier

    def extract_features(self, pose: Dict[str, Keypoint], hand_object: List[HandObjectState]) -> FrameFeatures:
        return FrameFeatures(pose=pose, hand_object=hand_object)

    def predict(self, features: FrameFeatures) -> Dict[str, float]:
        """Return {activity_class: confidence} for a single frame."""
        raise NotImplementedError("Train the HAR classifier on ASTRA-HAR feature data — see backend/ai/README.md")
