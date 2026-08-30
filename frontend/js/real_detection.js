/* ==========================================================================
   real_detection.js
   GENUINE on-device computer vision — not a mock. Wraps MediaPipe Tasks
   Vision (Object Detector + Pose Landmarker), running fully offline via
   WASM once its model files (frontend/assets/mediapipe/) have loaded from
   this same origin — no network calls after first load, no server-side
   inference.

   This is real, general-purpose CV: person + ~80 COCO object classes,
   and real 33-point pose landmarks. It has NOT been trained on KRIYA-SENSE's
   lab equipment (test tube, syringe, etc.) or on the BAS action sequence —
   that requires the custom dataset documented in backend/ai/README.md.
   Anything this module can't honestly claim (e.g. "pick up bottle") it
   reports as null rather than guessing, so the UI never fabricates a label.

   Output shape matches detection.js's mock contract exactly — persons[]
   with normalized bbox/pose/activity/confidence, objects[] with normalized
   bbox/label/confidence — so tracking.js/overlay.js/activity.js don't
   care whether a frame came from here or from the mock pipeline.
   ========================================================================== */

const ASTRA_REAL_DETECTION = (() => {

  // Absolute (root-relative) on purpose: dynamic import() resolves relative
  // specifiers against this script's own URL (/js/real_detection.js), not
  // the document's — a relative path here would look under /js/assets/.
  const ASSET_BASE = '/assets/mediapipe';

  let objectDetector = null;
  let poseLandmarker = null;
  let mode = 'VIDEO'; // MediaPipe running mode both detectors are currently configured for
  let ready = false;
  let unsupportedReason = null;
  let loadingPromise = null;

  // MediaPipe's 33 pose landmark indices, standard order.
  const IDX = {
    nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14,
    lWrist: 15, rWrist: 16, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26,
    lAnkle: 27, rAnkle: 28,
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  async function init() {
    if (ready) return { ok: true };
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      try {
        const vision = await import(`${ASSET_BASE}/vision_bundle.mjs`);
        const { FilesetResolver, ObjectDetector, PoseLandmarker } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(`${ASSET_BASE}/wasm`);

        objectDetector = await ObjectDetector.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: `${ASSET_BASE}/models/efficientdet_lite0.tflite` },
          scoreThreshold: 0.3,
          maxResults: 10,
          runningMode: 'VIDEO',
        });

        // Pose landmarker's OWN person-detector stage is tuned for a small
        // number of well-separated people and tends to merge two people
        // standing close together (e.g. a two-person selfie) into a single
        // pose. So it is not used to decide how many people are present —
        // see buildFrame() below, which uses the object detector's "person"
        // boxes (much better at counting close/overlapping people) as the
        // source of truth for who's in frame, and only asks the pose
        // landmarker for skeleton detail on top of that. numPoses is still
        // raised, and confidence thresholds lowered, to give it the best
        // chance of finding a pose for every person the object detector saw.
        poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: `${ASSET_BASE}/models/pose_landmarker_lite.task` },
          runningMode: 'VIDEO',
          numPoses: 6,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });

        mode = 'VIDEO';
        ready = true;
        return { ok: true };
      } catch (err) {
        unsupportedReason = (err && err.message) || 'Failed to load on-device model (needs to be served over http/https, not file://)';
        return { ok: false, error: unsupportedReason };
      }
    })();

    return loadingPromise;
  }

  async function ensureMode(target) {
    if (mode === target) return;
    await objectDetector.setOptions({ runningMode: target });
    await poseLandmarker.setOptions({ runningMode: target });
    mode = target;
  }

  function isReady() { return ready; }
  function getUnsupportedReason() { return unsupportedReason; }

  /** hip/knee/ankle geometry -> STANDING/SITTING, or null if legs aren't reliably visible. */
  function estimateActivity(lm) {
    const vis = (i) => (lm[i] && typeof lm[i].visibility === 'number') ? lm[i].visibility : 0;
    const minVis = Math.min(vis(IDX.lHip), vis(IDX.rHip), vis(IDX.lKnee), vis(IDX.rKnee));
    if (minVis < 0.3) return null;
    const hipY = (lm[IDX.lHip].y + lm[IDX.rHip].y) / 2;
    const kneeY = (lm[IDX.lKnee].y + lm[IDX.rKnee].y) / 2;
    const ankleY = (lm[IDX.lAnkle].y + lm[IDX.rAnkle].y) / 2;
    const thigh = kneeY - hipY;
    const shin = ankleY - kneeY;
    if (thigh <= 0.01 || shin <= 0.01) return null;
    return (thigh / shin) < 0.55 ? 'SITTING' : 'STANDING';
  }

  function poseFromLandmarks(lm) {
    const mid = (a, b) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2 });
    const pt = (i) => ({ x: lm[i].x, y: lm[i].y });
    const neck = mid(IDX.lShoulder, IDX.rShoulder);
    const hip = mid(IDX.lHip, IDX.rHip);
    return {
      head: pt(IDX.nose), neck,
      lShoulder: pt(IDX.lShoulder), rShoulder: pt(IDX.rShoulder),
      lElbow: pt(IDX.lElbow), rElbow: pt(IDX.rElbow),
      lWrist: pt(IDX.lWrist), rWrist: pt(IDX.rWrist),
      spine: { x: (neck.x + hip.x) / 2, y: (neck.y + hip.y) / 2 },
      hip, lHip: pt(IDX.lHip), rHip: pt(IDX.rHip),
      lKnee: pt(IDX.lKnee), rKnee: pt(IDX.rKnee),
      lAnkle: pt(IDX.lAnkle), rAnkle: pt(IDX.rAnkle),
    };
  }

  function landmarksBBox(lm) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    lm.forEach(p => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const padX = (maxX - minX) * 0.12, padTop = (maxY - minY) * 0.15, padBot = (maxY - minY) * 0.05;
    return {
      x: clamp01(minX - padX), y: clamp01(minY - padTop),
      width: clamp01(maxX - minX + padX * 2), height: clamp01(maxY - minY + padTop + padBot),
    };
  }

  function poseVisibilityConfidence(lm) {
    const visSum = lm.reduce((s, p) => s + (typeof p.visibility === 'number' ? p.visibility : 1), 0);
    return Math.max(40, Math.min(95, (visSum / lm.length) * 100));
  }

  function buildFrame(objResult, poseResult, frameW, frameH) {
    const personBoxes = (objResult.detections || []).filter(d => d.categories[0] && d.categories[0].categoryName === 'person');
    const otherObjects = (objResult.detections || []).filter(d => !d.categories[0] || d.categories[0].categoryName !== 'person');
    const poses = poseResult.landmarks || [];
    const usedPoseIdx = new Set();

    function poseCenterPx(lm) {
      let sx = 0, sy = 0;
      lm.forEach(p => { sx += p.x * frameW; sy += p.y * frameH; });
      return { x: sx / lm.length, y: sy / lm.length };
    }

    // Source of truth for WHO is in frame: the object detector's "person"
    // boxes (see the note above PoseLandmarker.createFromOptions — it's
    // meaningfully better than the pose landmarker's own person-detector
    // at telling two close-together people apart). Each box then gets
    // whichever pose landmark set sits closest to it, if any.
    const persons = personBoxes.map(d => {
      const cat = d.categories[0];
      const bb = d.boundingBox;
      const bbox = {
        x: clamp01(bb.originX / frameW), y: clamp01(bb.originY / frameH),
        width: clamp01(bb.width / frameW), height: clamp01(bb.height / frameH),
      };
      const boxCenter = { x: bb.originX + bb.width / 2, y: bb.originY + bb.height / 2 };
      const maxMatchDist = Math.max(bb.width, bb.height) * 0.7;

      let bestIdx = -1, bestDist = Infinity;
      poses.forEach((lm, i) => {
        if (usedPoseIdx.has(i)) return;
        const c = poseCenterPx(lm);
        const dist = Math.hypot(c.x - boxCenter.x, c.y - boxCenter.y);
        if (dist < bestDist && dist <= maxMatchDist) { bestDist = dist; bestIdx = i; }
      });

      let pose = null, activity = null;
      if (bestIdx >= 0) {
        usedPoseIdx.add(bestIdx);
        pose = poseFromLandmarks(poses[bestIdx]);
        activity = estimateActivity(poses[bestIdx]);
      }

      return { kind: 'person', label: 'person', bbox, pose, activity, confidence: cat.score * 100 };
    });

    // A pose the object detector's NMS happened to miss still counts as a
    // person — build their box from their own landmarks rather than
    // dropping them, so nobody visible just disappears.
    poses.forEach((lm, i) => {
      if (usedPoseIdx.has(i)) return;
      persons.push({
        kind: 'person', label: 'person',
        bbox: landmarksBBox(lm), pose: poseFromLandmarks(lm),
        activity: estimateActivity(lm), confidence: poseVisibilityConfidence(lm),
      });
    });

    const objects = otherObjects.map(d => {
      const cat = d.categories[0];
      const bb = d.boundingBox;
      return {
        kind: 'object',
        label: cat.categoryName.toUpperCase().replace(/ /g, '_'),
        confidence: cat.score * 100,
        bbox: {
          x: clamp01(bb.originX / frameW), y: clamp01(bb.originY / frameH),
          width: clamp01(bb.width / frameW), height: clamp01(bb.height / frameH),
        },
      };
    });

    return { persons, objects };
  }

  /** Synchronous — call only after ensureMode('VIDEO') has resolved at least once. */
  function detectVideoFrameSync(videoEl, tsMs) {
    if (!ready || mode !== 'VIDEO') return { persons: [], objects: [] };
    if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth) return { persons: [], objects: [] };
    const objResult = objectDetector.detectForVideo(videoEl, tsMs);
    const poseResult = poseLandmarker.detectForVideo(videoEl, tsMs);
    return buildFrame(objResult, poseResult, videoEl.videoWidth, videoEl.videoHeight);
  }

  async function prepareForVideo() {
    if (!ready) return;
    await ensureMode('VIDEO');
  }

  async function detectImageAsync(imgEl) {
    if (!ready) return { persons: [], objects: [] };
    if (imgEl.decode) { try { await imgEl.decode(); } catch (e) { /* fall through — still try to read it */ } }
    if (!imgEl.naturalWidth) return { persons: [], objects: [] };
    await ensureMode('IMAGE');
    const objResult = objectDetector.detect(imgEl);
    const poseResult = poseLandmarker.detect(imgEl);
    const frame = buildFrame(objResult, poseResult, imgEl.naturalWidth, imgEl.naturalHeight);
    // One-shot image detections never pass through the tracker (nothing to
    // track across frames), so — unlike the video path — nobody else
    // assigns a stable id. Do it here, the same way detection.js's mock
    // generateImageDetections() does for a static image.
    frame.persons.forEach((p, i) => { p.id = i + 1; });
    frame.objects.forEach((o, i) => { o.id = i + 1; });
    return frame;
  }

  return { init, isReady, getUnsupportedReason, detectVideoFrameSync, prepareForVideo, detectImageAsync };
})();
