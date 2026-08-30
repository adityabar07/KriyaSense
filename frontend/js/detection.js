/* ==========================================================================
   detection.js
   Mock AI inference layer — stands in for the future YOLO + pose + HAR
   backend. It produces detections in the EXACT contract shape a real
   backend would send over /ws/ai-stream: normalized (0..1) bounding boxes,
   one entry per person/object, with per-person pose keypoints also in
   normalized frame coordinates.

   Two entry points:
     - generateLiveCandidates(t): continuous mode (video/camera). Returns
       RAW, ANONYMOUS candidates each call (no id) — tracking.js is what
       assigns/maintains stable track_id across calls.
     - generateImageDetections(): one-shot mode (uploaded image). Assigns
       ids directly since there is only ever one frame to reason about.

   Nothing here touches the DOM or canvas — overlay.js renders whatever
   this module (via tracking.js) produces.
   ========================================================================== */

const ASTRA_DETECTION = (() => {

  const ACTIVITIES = [
    'PICK_UP', 'OPEN_CAP', 'DRAW_LIQUID', 'POUR_LIQUID', 'MIX', 'PLACE_BACK',
    'STANDING', 'WALKING', 'SITTING', 'READING', 'PHONE_USE', 'CARRYING',
  ];

  // BAS chemical-handling lab equipment (matches the ISRO problem statement's
  // representative experiment: pick up bottle -> open cap -> draw liquid via
  // syringe/pipette -> pour into test tube -> mix -> place equipment back).
  const OBJECT_LAYOUT = [
    { label: 'CHEMICAL_BOTTLE', x: 0.72, y: 0.56, w: 0.07, h: 0.17, base: 98.1 },
    { label: 'TEST_TUBE', x: 0.64, y: 0.62, w: 0.035, h: 0.14, base: 96.8 },
    { label: 'SYRINGE', x: 0.58, y: 0.68, w: 0.10, h: 0.045, base: 95.4 },
    { label: 'PIPETTE', x: 0.83, y: 0.32, w: 0.03, h: 0.15, base: 94.6 },
    { label: 'PETRI_DISH', x: 0.10, y: 0.74, w: 0.10, h: 0.05, base: 97.2 },
  ];

  const HAND_ACTIVE_ACTIVITIES = new Set(['PICK_UP', 'OPEN_CAP', 'DRAW_LIQUID', 'POUR_LIQUID', 'MIX', 'REACHING', 'PICKING_OBJECT']);

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function jitter(base, spread) { return Math.max(0, Math.min(100, base + (Math.random() * 2 - 1) * spread)); }

  /** Builds a normalized-coordinate stick-figure pose for a bbox + activity. */
  function personPose(bbox, activity, t) {
    const { x, y, width: w, height: h } = bbox;
    const walk = activity === 'WALKING' ? Math.sin(t * 2.4) * 0.03 : 0;
    const reach = HAND_ACTIVE_ACTIVITIES.has(activity) ? 0.07 : 0.015;
    const armSwing = activity === 'WALKING' ? Math.sin(t * 2.4 + Math.PI) * 0.025 : reach;
    const cx = x + w / 2;
    const top = y, bottom = y + h;
    const shoulderY = top + h * 0.22;
    const hipY = top + h * 0.55;

    return {
      head: { x: cx, y: top + h * 0.06 },
      neck: { x: cx, y: shoulderY },
      lShoulder: { x: cx - w * 0.22, y: shoulderY },
      rShoulder: { x: cx + w * 0.22, y: shoulderY },
      lElbow: { x: cx - w * 0.30 + walk, y: shoulderY + h * 0.16 },
      rElbow: { x: cx + w * 0.30 - walk, y: shoulderY + h * 0.16 },
      lWrist: { x: cx - w * 0.26 + armSwing, y: shoulderY + h * 0.30 },
      rWrist: { x: cx + w * 0.26 - armSwing, y: shoulderY + h * 0.30 },
      spine: { x: cx, y: (shoulderY + hipY) / 2 },
      hip: { x: cx, y: hipY },
      lHip: { x: cx - w * 0.15, y: hipY },
      rHip: { x: cx + w * 0.15, y: hipY },
      lKnee: { x: cx - w * 0.17 - walk, y: hipY + h * 0.22 },
      rKnee: { x: cx + w * 0.17 + walk, y: hipY + h * 0.22 },
      lAnkle: { x: cx - w * 0.18 - walk * 1.6, y: bottom },
      rAnkle: { x: cx + w * 0.18 + walk * 1.6, y: bottom },
    };
  }

  // -------------------------------------------------------------------
  // Continuous (video / live camera) scripted scene — deterministic
  // function of elapsed time t, plus small per-frame noise so the
  // tracker has real frame-to-frame matching work to do.
  // -------------------------------------------------------------------

  /** The astronaut performing the BAS chemical-handling experiment at the payload rack. */
  function personAScript(t) {
    const cycle = t % 30;
    let activity, cx, h;
    if (cycle < 3) { activity = 'STANDING'; cx = 0.30; h = 0.62; }
    else if (cycle < 8) { activity = 'PICK_UP'; cx = 0.30 + (cycle - 3) / 5 * 0.12; h = 0.60; }
    else if (cycle < 12) { activity = 'OPEN_CAP'; cx = 0.42; h = 0.58; }
    else if (cycle < 17) { activity = 'DRAW_LIQUID'; cx = 0.42; h = 0.58; }
    else if (cycle < 22) { activity = 'POUR_LIQUID'; cx = 0.46; h = 0.58; }
    else if (cycle < 27) { activity = 'MIX'; cx = 0.46; h = 0.58; }
    else { activity = 'PLACE_BACK'; cx = 0.46 - (cycle - 27) / 3 * 0.16; h = 0.60; }
    const w = 0.15;
    const y = 0.92 - h;
    return { kind: 'person', label: 'person', activity, confidence: jitter(96, 2.5), bbox: { x: clamp01(cx - w / 2), y, width: w, height: h } };
  }

  function personBScript(t) {
    const cycle = t % 60;
    if (cycle < 8 || cycle > 42) return null; // walks out of frame between cycles
    const local = cycle - 8;
    let activity, cx, h;
    if (local < 10) { activity = 'WALKING'; cx = 0.78 - local / 10 * 0.20; h = 0.55; }
    else if (local < 24) { activity = 'CARRYING'; cx = 0.58; h = 0.55; }
    else { activity = 'STANDING'; cx = 0.62; h = 0.58; }
    const w = 0.14;
    const y = 0.90 - h;
    return { kind: 'person', label: 'person', activity, confidence: jitter(94, 3), bbox: { x: clamp01(cx - w / 2), y, width: w, height: h } };
  }

  function generateLiveCandidates(t) {
    const persons = [personAScript(t), personBScript(t)].filter(Boolean).map(p => {
      const bbox = {
        x: clamp01(p.bbox.x + Math.sin(t * 3 + p.bbox.x * 10) * 0.004),
        y: clamp01(p.bbox.y + Math.cos(t * 2.6 + p.bbox.y * 10) * 0.004),
        width: p.bbox.width,
        height: p.bbox.height,
      };
      return { ...p, bbox, pose: personPose(bbox, p.activity, t) };
    });

    const objects = OBJECT_LAYOUT.map(o => ({
      kind: 'object',
      label: o.label,
      activity: null,
      confidence: jitter(o.base, 1.2),
      bbox: {
        x: clamp01(o.x + Math.sin(t * 1.3 + o.x * 7) * 0.006),
        y: clamp01(o.y + Math.cos(t * 1.1 + o.y * 7) * 0.006),
        width: o.w,
        height: o.h,
      },
    }));

    return { persons, objects };
  }

  // -------------------------------------------------------------------
  // One-shot (uploaded image) detection — computed once, held static.
  // -------------------------------------------------------------------

  function generateImageDetections() {
    const count = 1 + Math.floor(Math.random() * 4); // 1..4 people
    const activityChoices = ['STANDING', 'STANDING', 'STANDING', 'SITTING', 'WALKING', 'PHONE_USE'];
    const slotW = 1 / count;

    const persons = [];
    for (let i = 0; i < count; i++) {
      const activity = activityChoices[Math.floor(Math.random() * activityChoices.length)];
      const h = activity === 'SITTING' ? 0.50 + Math.random() * 0.10 : 0.62 + Math.random() * 0.12;
      const w = 0.14 + Math.random() * 0.05;
      const cx = slotW * i + slotW / 2 + (Math.random() * 0.06 - 0.03);
      const y = 0.90 - h;
      const bbox = { x: clamp01(cx - w / 2), y, width: w, height: h };
      persons.push({
        id: i + 1, kind: 'person', label: 'person', activity,
        confidence: jitter(96, 3), bbox, pose: personPose(bbox, activity, 0),
      });
    }

    const objectCount = Math.floor(Math.random() * 3);
    const objects = OBJECT_LAYOUT.slice().sort(() => Math.random() - 0.5).slice(0, objectCount).map((o, i) => ({
      id: i + 1, kind: 'object', label: o.label, activity: null,
      confidence: jitter(o.base, 1.5), bbox: { x: o.x, y: o.y, width: o.w, height: o.h },
    }));

    return { persons, objects };
  }

  return { generateLiveCandidates, generateImageDetections, ACTIVITIES, OBJECT_LAYOUT };
})();
