"""
Multi-object tracker — nearest-centroid matching.

Unlike the other ai/ modules, this one is a genuine working implementation,
not a stub: centroid tracking is classical CV/geometry, not a trained
model, so there's no reason to fake it. It mirrors frontend/js/tracking.js
exactly, so id-assignment behavior matches on both sides during
development.

Swap in a real ByteTrack/BoT-SORT later by keeping the same update()
signature — everything downstream (hand-object interaction, HAR, FSM)
only depends on Track.track_id being stable across frames, not on how
it's computed.
"""

from dataclasses import dataclass
from math import hypot
from typing import Dict, List, Optional, Tuple

from ai.yolo.detector import BBox, Detection


@dataclass
class Track:
    track_id: int
    label: str
    bbox: BBox
    confidence: float
    misses: int = 0


def _center(bbox: BBox) -> Tuple[float, float]:
    return (bbox.x + bbox.width / 2, bbox.y + bbox.height / 2)


class CentroidTracker:
    def __init__(self, max_distance: float = 0.18, max_age: int = 8):
        self.max_distance = max_distance
        self.max_age = max_age
        self._tracks: Dict[int, Track] = {}
        self._next_id = 1

    def reset(self) -> None:
        self._tracks.clear()
        self._next_id = 1

    def update(self, detections: List[Detection]) -> List[Track]:
        unmatched_ids = set(self._tracks.keys())
        results: List[Track] = []

        for det in detections:
            det_center = _center(det.bbox)
            best_id: Optional[int] = None
            best_dist = float("inf")

            for tid in unmatched_ids:
                track = self._tracks[tid]
                if track.label != det.label:
                    continue
                dist = hypot(det_center[0] - _center(track.bbox)[0], det_center[1] - _center(track.bbox)[1])
                if dist < best_dist and dist <= self.max_distance:
                    best_dist = dist
                    best_id = tid

            if best_id is not None:
                track = self._tracks[best_id]
                track.bbox = det.bbox
                track.confidence = det.confidence
                track.misses = 0
                unmatched_ids.discard(best_id)
                results.append(track)
            else:
                track = Track(track_id=self._next_id, label=det.label, bbox=det.bbox, confidence=det.confidence)
                self._tracks[track.track_id] = track
                self._next_id += 1
                results.append(track)

        for tid in unmatched_ids:
            self._tracks[tid].misses += 1
        self._tracks = {tid: t for tid, t in self._tracks.items() if t.misses <= self.max_age}

        return results
