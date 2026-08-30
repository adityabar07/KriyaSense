"""
Pose estimation — interface skeleton (MediaPipe Pose or YOLO-Pose).

Expected real implementation: MediaPipe Pose (33 landmarks) or a YOLO-Pose
model, run per detected person bbox, returning normalized keypoints in the
same coordinate space as YOLODetector's bboxes. See backend/ai/README.md.
"""

from dataclasses import dataclass
from typing import Dict

from ai.yolo.detector import BBox


@dataclass
class Keypoint:
    x: float
    y: float
    visibility: float  # 0..1, per MediaPipe's landmark visibility convention


# MediaPipe Pose's 33 landmark names, in index order — kept here so the rest
# of the pipeline (hand-object interaction, HAR features) can address
# keypoints by name instead of magic indices.
POSE_LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]


class PoseEstimator:
    def __init__(self):
        self._model = None  # TODO: mp.solutions.pose.Pose(...) or a YOLO-Pose model

    def load(self) -> None:
        raise NotImplementedError("Wire up MediaPipe Pose or YOLO-Pose — see backend/ai/README.md")

    def estimate(self, frame, person_bbox: BBox) -> Dict[str, Keypoint]:
        """Return {landmark_name: Keypoint} for one person, normalized to the full frame."""
        raise NotImplementedError("Wire up MediaPipe Pose or YOLO-Pose — see backend/ai/README.md")
