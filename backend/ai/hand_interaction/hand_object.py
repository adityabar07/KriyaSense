"""
Hand-object interaction — interface skeleton.

Expected real implementation: hand keypoints (from ai/pose or a dedicated
hand-detection model) matched against nearby object bboxes from
ai/yolo/detector.py by proximity + persistence over a few frames,
classified into an interaction state. See backend/ai/README.md.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional

from ai.pose.pose_estimator import Keypoint
from ai.yolo.detector import Detection

INTERACTION_STATES = ["IDLE", "REACHING", "GRASPING", "MANIPULATING"]


@dataclass
class HandObjectState:
    hand: str                      # "left_wrist" | "right_wrist"
    target_object: Optional[str]   # matches Detection.label, or None if no object is near
    interaction: str               # one of INTERACTION_STATES
    distance: float                # normalized distance to target_object, 0..1


class HandObjectInteractionModel:
    def infer(self, pose: Dict[str, Keypoint], objects: List[Detection]) -> List[HandObjectState]:
        """For each wrist keypoint, find the nearest object and classify the interaction state.

        This is what the FSM's "expected object" checks (e.g. pick_up must
        target chemical_bottle, not test_tube) will validate against.
        """
        raise NotImplementedError(
            "Define proximity/persistence thresholds after collecting the hand-object dataset — "
            "see backend/ai/README.md"
        )
