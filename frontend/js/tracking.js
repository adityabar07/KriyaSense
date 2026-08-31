/* ==========================================================================
   tracking.js
   Generic nearest-centroid multi-entity tracker. Stands in for a future
   backend tracker (ByteTrack / BoT-SORT). It does NOT generate detections
   itself — it consumes anonymous per-frame candidate detections (from
   detection.js) and returns them enriched with a STABLE track_id, matched
   frame-to-frame by proximity so an entity keeps the same id as it moves,
   and dropped once it goes unmatched for too long (i.e. leaves the frame).
   ========================================================================== */

const ASTRA_TRACKING = (() => {

  function centerOf(bbox) {
    return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function createTracker({ maxDistance = 0.18, maxAge = 15 } = {}) {
    let nextId = 1;
    let tracks = []; // {id, kind, label, bbox, activity, confidence, pose, misses}

    function update(candidates) {
      const unmatched = new Set(tracks.map((_, i) => i));
      const results = [];

      candidates.forEach(cand => {
        const candCenter = centerOf(cand.bbox);
        let bestIdx = -1;
        let bestDist = Infinity;

        unmatched.forEach(i => {
          const t = tracks[i];
          if (t.kind !== cand.kind) return;
          if (cand.kind === 'object' && t.label !== cand.label) return;
          const d = dist(candCenter, centerOf(t.bbox));
          if (d < bestDist && d <= maxDistance) {
            bestDist = d;
            bestIdx = i;
          }
        });

        if (bestIdx >= 0) {
          const t = tracks[bestIdx];
          t.bbox = cand.bbox;
          t.activity = cand.activity;
          t.confidence = cand.confidence;
          t.pose = cand.pose;
          t.worldPose = cand.worldPose;
          t.misses = 0;
          unmatched.delete(bestIdx);
          results.push(t);
        } else {
          const t = {
            id: nextId++,
            kind: cand.kind,
            label: cand.label,
            bbox: cand.bbox,
            activity: cand.activity,
            confidence: cand.confidence,
            pose: cand.pose,
            worldPose: cand.worldPose,
            misses: 0,
          };
          tracks.push(t);
          results.push(t);
        }
      });

      // Anything not matched this round survives briefly (short occlusion
      // tolerance) but is not rendered until it matches again; past maxAge
      // missed rounds it is dropped entirely (the entity "left the frame").
      unmatched.forEach(i => { tracks[i].misses += 1; });
      tracks = tracks.filter(t => t.misses <= maxAge);

      return results.map(t => ({ ...t }));
    }

    function reset() {
      tracks = [];
      nextId = 1;
    }

    return { update, reset };
  }

  return { createTracker };
})();
