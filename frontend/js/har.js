/* ==========================================================================
   har.js
   Human Activity Recognition — the actual classification logic, separated
   from raw pose detection (real_detection.js) and identity tracking
   (tracking.js). This is a transparent, rule-based baseline built on real
   pose geometry and real multi-frame motion — not a per-frame guess, not a
   timer, not a hardcoded label. It's structured so a trained temporal model
   (LSTM/GRU/Transformer, per backend/ai/README.md) can later replace
   classifyVideoFrame()'s scoring step without touching anything else in
   the pipeline: the feature extraction, history buffering, and smoothing
   stay the same either way.

   Two entry points:
     - classifyVideoFrame(trackId, worldPose, pose2D, nearbyObjects)
       Maintains a rolling per-person temporal window keyed by the stable
       track_id from tracking.js. Supports all 10 activities, including the
       motion-only ones (WALKING/RUNNING/OPENING/CLOSING).
     - classifyStaticImage(worldPose, pose2D, nearbyObjects)
       No history exists for a single uploaded image, so motion-only
       activities cannot honestly be claimed — see TEMPORAL_ONLY below.

   Geometry note: all angle/distance features are computed from MediaPipe's
   WORLD landmarks (real metric 3D coordinates, roughly hip-centered) rather
   than 2D image pixels. A bent knee is a bent knee regardless of how the
   camera is rotated relative to the body — this is what makes the
   classification itself orientation-robust, independent of any assumption
   about which way is "down" in the frame. (The pose *detector* underneath
   is still Earth-trained and has its own limits in truly arbitrary
   orientations — seg backend/ai/README.md's orientation section — but nothing
   in this file assumes gravity or a fixed image-down direction.)
   ========================================================================== */

const ASTRA_HAR = (() => {

  const ACTIVITY_CODES = [
    'STANDING', 'WALKING', 'SITTING', 'RUNNING', 'READING', 'WRITING',
    'USING_LAPTOP', 'USING_PHONE', 'OPENING', 'CLOSING',
  ];
  const TEMPORAL_ONLY = new Set(['WALKING', 'RUNNING', 'OPENING', 'CLOSING']);

  const WINDOW_SIZE = 24;             // rolling history length (frames)
  const MIN_TEMPORAL_FRAMES = 8;      // minimum samples before motion features are trusted
  const SMOOTH_WINDOW = 5;            // majority-vote window for label stability
  const SMOOTH_MAJORITY = 3;          // votes needed out of SMOOTH_WINDOW to switch the displayed label
  const CONFIDENCE_FLOOR = 45;        // below this, report UNCERTAIN instead of guessing
  // Ceiling for activities that are fundamentally person-USES-object actions
  // (reading/writing/laptop/phone) when that object was NOT actually
  // detected. Body pose alone genuinely cannot separate "sitting" from
  // "sitting reading a book", so without object evidence these stay below a
  // confident posture/motion reading rather than overriding it. With the
  // object detected they are uncapped and can legitimately win.
  const OBJECTLESS_CAP = 55;

  /* ------------------------------- 3D vector helpers ------------------------------- */

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });
  const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
  const mag = (a) => Math.sqrt(dot(a, a));
  const dist3 = (a, b) => mag(sub(a, b));

  /** Angle at vertex b formed by a-b-c, in degrees. Pure vector geometry — no assumption about "up". */
  function angleAt(a, b, c) {
    if (!a || !b || !c) return null;
    const v1 = sub(a, b), v2 = sub(c, b);
    const m1 = mag(v1), m2 = mag(v2);
    if (m1 < 1e-5 || m2 < 1e-5) return null;
    let cos = dot(v1, v2) / (m1 * m2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  }

  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  function stddev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(mean(a.map(v => (v - m) ** 2)));
  }
  /** Pearson correlation of two equal-length series; ~-1 = perfectly alternating, the gait signature. */
  function correlation(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return 0;
    a = a.slice(-n); b = b.slice(-n);
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    if (da === 0 || db === 0) return 0;
    return num / Math.sqrt(da * db);
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const clampScore = (v) => Math.max(0, Math.min(100, v));
  /** Bump function peaked at `center`, 1.0 at the peak, decaying over `width`. */
  const gaussian = (value, center, width) => Math.exp(-((value - center) ** 2) / (2 * width * width));

  /* ------------------------------- per-frame feature extraction ------------------------------- */

  /**
   * worldPose: {jointName: {x,y,z,visibility}} in MediaPipe world (metric,
   * hip-centered) coordinates — see poseFromWorldLandmarks() in
   * real_detection.js for how it's built.
   */
  function extractFeatures(w) {
    const need = ['nose', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow', 'lWrist', 'rWrist',
      'lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle'];
    for (const k of need) if (!w[k]) return null;

    const vis = (j) => (w[j] && typeof w[j].visibility === 'number') ? w[j].visibility : 1;
    const minVis = Math.min(...need.map(vis));

    const shoulderCenter = mid(w.lShoulder, w.rShoulder);
    const hipCenter = mid(w.lHip, w.rHip);
    const bodyScale = Math.max(dist3(w.lShoulder, w.rShoulder), dist3(w.lHip, w.rHip), 0.08);

    return {
      t: performance.now(),
      minVis,
      bodyScale,
      hipCenter, shoulderCenter,
      nose: w.nose, lWrist: w.lWrist, rWrist: w.rWrist, lAnkle: w.lAnkle, rAnkle: w.rAnkle,
      lKneeAngle: angleAt(w.lHip, w.lKnee, w.lAnkle),
      rKneeAngle: angleAt(w.rHip, w.rKnee, w.rAnkle),
      lElbowAngle: angleAt(w.lShoulder, w.lElbow, w.lWrist),
      rElbowAngle: angleAt(w.rShoulder, w.rElbow, w.rWrist),
      lHipAngle: angleAt(w.lShoulder, w.lHip, w.lKnee),
      rHipAngle: angleAt(w.rShoulder, w.rHip, w.rKnee),
      // Head bowed relative to the person's own spine axis (not image-down) —
      // ~180deg when nose/shoulder-center/hip-center are roughly in line,
      // shrinking as the head tilts forward toward a reading/writing surface.
      headTiltAngle: angleAt(w.nose, shoulderCenter, hipCenter),
      wristToNoseL: dist3(w.lWrist, w.nose) / bodyScale,
      wristToNoseR: dist3(w.rWrist, w.nose) / bodyScale,
      wristToHipL: dist3(w.lWrist, hipCenter) / bodyScale,
      wristToHipR: dist3(w.rWrist, hipCenter) / bodyScale,
    };
  }

  /* ------------------------------- temporal window aggregation ------------------------------- */

  function computeTemporalStats(frames) {
    if (frames.length < 2) return null;
    const first = frames[0], last = frames[frames.length - 1];
    const dtTotal = (last.t - first.t) / 1000;
    if (dtTotal <= 0) return null;

    const hipDisp = dist3(last.hipCenter, first.hipCenter) / last.bodyScale;
    const hipDispRate = hipDisp / dtTotal; // body-widths of net displacement per second

    const hipVar = (stddev(frames.map(f => f.hipCenter.x)) + stddev(frames.map(f => f.hipCenter.y)) + stddev(frames.map(f => f.hipCenter.z))) / last.bodyScale;

    const lKnees = frames.map(f => f.lKneeAngle).filter(v => v != null);
    const rKnees = frames.map(f => f.rKneeAngle).filter(v => v != null);
    const kneeAlternation = correlation(frames.map(f => f.lKneeAngle || 0), frames.map(f => f.rKneeAngle || 0));

    let ankleVelSum = 0, n = 0;
    for (let i = 1; i < frames.length; i++) {
      const dt = (frames[i].t - frames[i - 1].t) / 1000;
      if (dt <= 0) continue;
      const lv = dist3(frames[i].lAnkle, frames[i - 1].lAnkle) / frames[i].bodyScale / dt;
      const rv = dist3(frames[i].rAnkle, frames[i - 1].rAnkle) / frames[i].bodyScale / dt;
      ankleVelSum += (lv + rv) / 2;
      n++;
    }
    const ankleVel = n ? ankleVelSum / n : 0;

    const lWristAmp = (stddev(frames.map(f => f.lWrist.x)) + stddev(frames.map(f => f.lWrist.y)) + stddev(frames.map(f => f.lWrist.z))) / last.bodyScale;
    const rWristAmp = (stddev(frames.map(f => f.rWrist.x)) + stddev(frames.map(f => f.rWrist.y)) + stddev(frames.map(f => f.rWrist.z))) / last.bodyScale;

    // Net wrist displacement direction relative to torso (for OPENING/CLOSING):
    // positive = hand net-moved away from hip center over the window (pull/open-like),
    // negative = net-moved toward it (push/close-like). Weak signal by design — see scoreOpenClose().
    const wristAwayL = (dist3(last.lWrist, last.hipCenter) - dist3(first.lWrist, first.hipCenter)) / last.bodyScale;
    const wristAwayR = (dist3(last.rWrist, last.hipCenter) - dist3(first.rWrist, first.hipCenter)) / last.bodyScale;

    return {
      dtTotal, hipDispRate, hipVar, kneeAlternation, ankleVel,
      lKneeStd: stddev(lKnees), rKneeStd: stddev(rKnees),
      lWristAmp, rWristAmp, wristAwayL, wristAwayR,
      frameCount: frames.length,
    };
  }

  /* ------------------------------- per-activity scoring ------------------------------- */
  // Each function returns 0..100. Deliberately simple, named constants —
  // this is the rule-based baseline the README documents; a trained
  // temporal model replaces exactly this step, nothing upstream of it.

  function scoreStanding(f, s) {
    if (f.lKneeAngle == null || f.rKneeAngle == null || f.lHipAngle == null || f.rHipAngle == null) return 0;
    const kneeExt = Math.min(f.lKneeAngle, f.rKneeAngle);
    const hipExt = Math.min(f.lHipAngle, f.rHipAngle);
    // Real standing rarely locks the knee to a full 180deg — a braced or
    // athletic stance can sit around 130-150deg and is still standing, not
    // sitting. Treat ~100deg as the floor (full credit by ~165deg) rather
    // than requiring near-full extension.
    let score = clamp01((kneeExt - 100) / 65) * 40 + clamp01((hipExt - 100) / 65) * 30;
    score += s ? clamp01(1 - s.hipVar / 0.15) * 20 + clamp01(1 - s.ankleVel / 0.3) * 10 : 25;
    return clampScore(score);
  }

  function scoreSitting(f, s) {
    if (f.lKneeAngle == null || f.rKneeAngle == null || f.lHipAngle == null || f.rHipAngle == null) return 0;
    const kneeBend = Math.min(f.lKneeAngle, f.rKneeAngle);
    const hipBend = Math.min(f.lHipAngle, f.rHipAngle);
    // Narrower than standing's band on purpose: true sitting (thigh roughly
    // horizontal, weight on a seat) clusters tightly around ~80-110deg at
    // both joints. A wide band here was the bug — it gave a merely-bent-knee
    // standing pose (e.g. an athletic stance) more sitting credit than it
    // deserved.
    let score = gaussian(kneeBend, 90, 26) * 40 + gaussian(hipBend, 90, 28) * 30;
    score += s ? clamp01(1 - s.hipVar / 0.12) * 20 + clamp01(1 - s.ankleVel / 0.2) * 10 : 25;
    return clampScore(score);
  }

  function scoreWalking(s) {
    if (!s || s.frameCount < MIN_TEMPORAL_FRAMES) return 0;
    const score = clamp01(-s.kneeAlternation) * 35
      + gaussian(s.hipDispRate, 1.0, 0.8) * 30
      + gaussian(s.ankleVel, 1.3, 1.0) * 20
      + clamp01((s.lKneeStd + s.rKneeStd) / 40) * 15;
    return clampScore(score);
  }

  function scoreRunning(s) {
    if (!s || s.frameCount < MIN_TEMPORAL_FRAMES) return 0;
    const score = clamp01(-s.kneeAlternation) * 25
      + clamp01((s.hipDispRate - 1.6) / 2.0) * 35
      + clamp01((s.ankleVel - 2.2) / 3.0) * 25
      + clamp01((s.lKneeStd + s.rKneeStd - 40) / 40) * 15;
    return clampScore(score);
  }

  function scoreReading(f, s, objs) {
    if (f.headTiltAngle == null) return 0;
    const handsLow = f.wristToNoseL > 0.9 && f.wristToNoseR > 0.9; // not raised to head (rules out phone)
    // Reading needs a genuinely BOWED head, not merely a head that isn't
    // perfectly in line with the spine — a normal upright stance measures
    // ~140-170deg here, so anything in that band must score near zero or
    // every standing person reads. Full credit only well under ~150deg.
    let score = clamp01((150 - f.headTiltAngle) / 40) * 40;
    score += s ? clamp01(1 - s.hipVar / 0.10) * 20 : 15;
    score += handsLow ? 15 : 0;
    if (objs.has('BOOK')) return clampScore(score + 25);
    // No book detected: a bowed head alone is real evidence but weak — cap it
    // so it can never outrank a confident posture/motion reading.
    return Math.min(OBJECTLESS_CAP, clampScore(score));
  }

  function scoreWriting(f, s, objs) {
    if (f.headTiltAngle == null || !s) return 0;
    const lMoving = s.lWristAmp > 0.03 && s.lWristAmp < 0.35;
    const rMoving = s.rWristAmp > 0.03 && s.rWristAmp < 0.35;
    const oneHandWriting = (lMoving && s.rWristAmp <= 0.03) || (rMoving && s.lWristAmp <= 0.03);
    const elbowBent = (f.lElbowAngle != null && f.lElbowAngle < 150) || (f.rElbowAngle != null && f.rElbowAngle < 150);
    const wristLow = f.wristToNoseL > 0.7 && f.wristToNoseR > 0.7;
    let score = clamp01((150 - f.headTiltAngle) / 45) * 25;
    score += oneHandWriting ? 30 : 0;
    score += elbowBent ? 15 : 0;
    score += wristLow ? 10 : 0;
    score += clamp01(1 - s.hipVar / 0.10) * 10;
    if (objs.has('BOOK')) return clampScore(score + 10);
    return Math.min(OBJECTLESS_CAP, clampScore(score));
  }

  function scoreUsingLaptop(f, s, objs) {
    if (f.lHipAngle == null || f.rHipAngle == null || !s) return 0;
    const sittingLike = gaussian(Math.min(f.lHipAngle, f.rHipAngle), 95, 45);
    const wristsInFront = f.wristToHipL < 1.4 && f.wristToHipR < 1.4;
    const bothLowMotion = s.lWristAmp < 0.30 && s.rWristAmp < 0.30;
    let score = sittingLike * 25 + (wristsInFront ? 25 : 0) + (bothLowMotion ? 20 : 0);
    score += clamp01(1 - s.hipVar / 0.10) * 10;
    // "Sitting still with hands in your lap" is pose-identical to "typing on a
    // laptop" — pose alone genuinely cannot separate them, so without an
    // actual detected laptop this stays capped below what a clean SITTING
    // reading scores. Only a real object detection earns the full claim.
    if (objs.has('LAPTOP')) return clampScore(score + 25);
    // Stricter than OBJECTLESS_CAP: unlike reading (bowed head) or phone
    // (hand at face), "typing on a laptop" has NO pose signature at all that
    // distinguishes it from simply sitting still. Never claim it unseen.
    return Math.min(CONFIDENCE_FLOOR - 1, clampScore(score));
  }

  function scoreUsingPhone(f, s, objs) {
    const lRaised = f.wristToNoseL < 0.9 && f.lElbowAngle != null && f.lElbowAngle < 110;
    const rRaised = f.wristToNoseR < 0.9 && f.rElbowAngle != null && f.rElbowAngle < 110;
    if (!lRaised && !rRaised) return 0;
    let score = 45;
    score += s ? clamp01(1 - s.hipVar / 0.12) * 20 : 15;
    if (objs.has('CELL_PHONE')) return clampScore(score + 30);
    // A hand raised to the face is genuinely phone-like, but is equally
    // scratching your head / holding a mug / shielding your eyes — capped
    // until an actual phone is detected.
    return Math.min(OBJECTLESS_CAP, clampScore(score + 10));
  }

  /** OPENING/CLOSING — the weakest of the ten: Pose landmarks carry no finger/hand
      articulation and the object detector has no door/drawer/cabinet class, so this
      can only reason about hand-to-object approach + net displacement direction.
      Deliberately confidence-capped below — treat as a directional hint, not a
      confident classification, until real hand + object-state data exists. */
  function scoreOpenClose(f, s, objs) {
    if (!s || objs.size === 0) return { open: 0, close: 0 };
    const handNearObject = f.wristToHipL < 1.6 || f.wristToHipR < 1.6;
    if (!handNearObject) return { open: 0, close: 0 };
    const netAway = Math.max(s.wristAwayL, s.wristAwayR);
    const base = clamp01((s.lWristAmp + s.rWristAmp) / 0.5) * 30 + 15; // some hand motion near an object at all
    const openScore = base + clamp01(netAway / 0.6) * 20;
    const closeScore = base + clamp01(-netAway / 0.6) * 20;
    return { open: Math.min(62, clampScore(openScore)), close: Math.min(62, clampScore(closeScore)) };
  }

  /* ------------------------------- per-person state ------------------------------- */

  class PersonHistory {
    constructor() {
      this.frames = [];
      this.rawVotes = [];
      this.displayed = null;   // {activity, confidence}
      this.previous = null;
      this.since = Date.now();
    }

    pushFrame(features) {
      this.frames.push(features);
      if (this.frames.length > WINDOW_SIZE) this.frames.shift();
    }

    /** Majority-vote smoothing: only switch the displayed label once a new
        candidate has actually been the top pick for most of the recent window. */
    smooth(candidate) {
      this.rawVotes.push(candidate);
      if (this.rawVotes.length > SMOOTH_WINDOW) this.rawVotes.shift();

      const counts = {};
      this.rawVotes.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      let winner = candidate, winnerCount = 0;
      Object.entries(counts).forEach(([code, n]) => { if (n > winnerCount) { winner = code; winnerCount = n; } });

      if (!this.displayed) return winner;
      if (winner !== this.displayed.activity && winnerCount >= SMOOTH_MAJORITY) return winner;
      return this.displayed.activity;
    }

    commit(activity, confidence, reason) {
      if (this.displayed && this.displayed.activity !== activity) {
        this.previous = this.displayed.activity;
        this.since = Date.now();
      } else if (!this.displayed) {
        this.since = Date.now();
      }
      this.displayed = { activity, confidence, reason: reason || null };
      return {
        activity: this.displayed.activity,
        confidence: this.displayed.confidence,
        reason: this.displayed.reason,
        previous: this.previous,
        transition: this.previous ? `${this.previous} -> ${this.displayed.activity}` : null,
        sinceMs: this.since,
      };
    }
  }

  const people = new Map(); // trackId -> PersonHistory

  function getHistory(trackId) {
    let h = people.get(trackId);
    if (!h) { h = new PersonHistory(); people.set(trackId, h); }
    return h;
  }

  /* ------------------------------- classification core ------------------------------- */

  function rank(f, s, objs, allowTemporal) {
    const candidates = [
      ['STANDING', scoreStanding(f, s)],
      ['SITTING', scoreSitting(f, s)],
      ['READING', scoreReading(f, s, objs)],
      ['WRITING', scoreWriting(f, s, objs)],
      ['USING_LAPTOP', scoreUsingLaptop(f, s, objs)],
      ['USING_PHONE', scoreUsingPhone(f, s, objs)],
    ];
    if (allowTemporal) {
      candidates.push(['WALKING', scoreWalking(s)]);
      candidates.push(['RUNNING', scoreRunning(s)]);
      const oc = scoreOpenClose(f, s, objs);
      candidates.push(['OPENING', oc.open]);
      candidates.push(['CLOSING', oc.close]);
    }
    candidates.sort((a, b) => b[1] - a[1]);
    return candidates;
  }

  function decide(f, s, objs, allowTemporal) {
    if (!f) return { activity: 'UNCERTAIN', confidence: 0, reason: 'Insufficient pose information' };
    if (f.minVis < 0.35) return { activity: 'UNCERTAIN', confidence: Math.round(f.minVis * 100), reason: 'Insufficient pose information' };

    const ranked = rank(f, s, objs, allowTemporal);
    const [topCode, topScore] = ranked[0];

    if (topScore < CONFIDENCE_FLOOR) {
      const legAsymmetry = (f.lKneeAngle != null && f.rKneeAngle != null) ? Math.abs(f.lKneeAngle - f.rKneeAngle) : 0;
      const reason = (!allowTemporal && legAsymmetry > 35)
        ? 'Possible mid-motion posture — temporal video required for Walking/Running/Opening/Closing'
        : 'Insufficient pose information';
      return { activity: 'UNCERTAIN', confidence: Math.round(topScore), reason };
    }
    return { activity: topCode, confidence: Math.round(topScore), reason: null };
  }

  /* ------------------------------- public API ------------------------------- */

  function classifyVideoFrame(trackId, worldPose, nearbyObjects) {
    const history = getHistory(trackId);
    const f = worldPose ? extractFeatures(worldPose) : null;
    if (f) history.pushFrame(f);
    const s = computeTemporalStats(history.frames);
    const objs = new Set(nearbyObjects || []);

    const raw = decide(f, s, objs, true);
    const smoothed = raw.activity === 'UNCERTAIN' ? raw.activity : history.smooth(raw.activity);
    const finalActivity = smoothed;
    const finalConfidence = finalActivity === raw.activity ? raw.confidence : (history.displayed ? history.displayed.confidence : raw.confidence);
    return history.commit(finalActivity, finalConfidence, raw.activity === 'UNCERTAIN' ? raw.reason : null);
  }

  /** No per-image history exists, so motion-only activities are never offered — see TEMPORAL_ONLY. */
  function classifyStaticImage(worldPose, nearbyObjects) {
    const f = worldPose ? extractFeatures(worldPose) : null;
    const objs = new Set(nearbyObjects || []);
    const result = decide(f, null, objs, false);
    return { activity: result.activity, confidence: result.confidence, reason: result.reason, previous: null, transition: null, sinceMs: Date.now() };
  }

  function resetPerson(trackId) { people.delete(trackId); }
  function resetAll() { people.clear(); }

  return {
    ACTIVITY_CODES, TEMPORAL_ONLY,
    classifyVideoFrame, classifyStaticImage,
    resetPerson, resetAll,
  };
})();
