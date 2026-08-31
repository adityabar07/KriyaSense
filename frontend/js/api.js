/* ==========================================================================
   api.js
   Backend communication abstraction layer.

   Every exported function here is a stand-in for a real HTTP/WebSocket call
   to the future Python/FastAPI backend. Today they resolve from one of two
   local pipelines, selectable at runtime as "detection mode":

     REAL       — genuine on-device inference via real_detection.js
                  (MediaPipe person/pose/object detection, fully offline).
                  What it can't honestly claim (BAS-specific actions like
                  "open cap") it reports as null, not a guess.
     SIMULATED  — the scripted mock pipeline (detection.js -> tracking.js)
                  that acts out the full BAS chemical-handling sequence,
                  useful for demoing the experiment/FSM/violation flow
                  without needing a camera pointed at real lab equipment.

   Either way, every consumer — canvas overlay, detected-persons panel,
   event log — reads the exact same computeFrame() output, so there's
   never two disagreeing copies of "what's currently detected."

   To connect a real backend later: keep every function signature and
   returned JSON shape identical, and swap connectWebSocket()'s body from
   the setInterval mock to `new WebSocket(CONFIG.wsUrl)`, forwarding each
   parsed message straight to onFrame() — the payload shape already matches
   what the backend will send (see README "Future Backend Contract").
   ========================================================================== */

const ASTRA_API = (() => {

  const CONFIG = {
    apiBase: 'http://localhost:8000',
    wsUrl: 'ws://localhost:8000/ws/ai-stream',
    mode: 'MOCK', // 'MOCK' | 'LIVE' — backend connection mode (Settings page)
  };

  let socketInterval = null;
  let analysisRunning = true;
  let tracker = null;
  let subscribedToMedia = false;

  let detectionMode = 'REAL'; // 'REAL' | 'SIMULATED' — which inference pipeline drives the overlay
  let realEls = { video: null, img: null };
  let cachedMockImageFrame = null;
  let cachedRealImageFrame = null;
  const modeSubscribers = [];

  function ensureTracker() {
    if (!tracker) tracker = ASTRA_TRACKING.createTracker();
  }

  function setRealDetectionElements(els) {
    realEls = els;
  }

  function onModeChange(fn) { modeSubscribers.push(fn); }
  function notifyModeChange() { modeSubscribers.forEach(fn => fn(detectionMode)); }

  /** Object labels (from frame.objects) within proximity of either of a person's wrists — used by
      har.js to boost READING/WRITING/USING_LAPTOP/USING_PHONE/OPENING/CLOSING confidence. 2D/image-space
      on purpose: object boxes only exist in 2D, unlike the 3D world pose used for body geometry. */
  function nearbyObjectLabels(person, objects) {
    if (!person.pose) return [];
    const wrists = [person.pose.lWrist, person.pose.rWrist].filter(Boolean);
    if (!wrists.length || !objects.length) return [];
    const found = new Set();
    objects.forEach(o => {
      const cx = o.bbox.x + o.bbox.width / 2, cy = o.bbox.y + o.bbox.height / 2;
      wrists.forEach(w => {
        if (Math.hypot(w.x - cx, w.y - cy) < 0.18) found.add(o.label);
      });
    });
    return Array.from(found);
  }

  // The object detector can find a person the pose landmarker couldn't fit a
  // skeleton to (small, occluded, or partially out of frame). That person is
  // genuinely detected but has no body geometry to reason about — report it
  // as UNCERTAIN with a reason rather than guessing or showing a bare label.
  const NO_POSE_RESULT = { activity: 'UNCERTAIN', harReason: 'No pose landmarks for this person' };

  function applyHarVideo(persons, objects) {
    return persons.map(p => {
      if (!p.worldPose) return { ...p, ...NO_POSE_RESULT };
      const result = ASTRA_HAR.classifyVideoFrame(p.id, p.worldPose, nearbyObjectLabels(p, objects));
      return { ...p, activity: result.activity, confidence: result.confidence, harReason: result.reason, harPrevious: result.previous };
    });
  }

  function applyHarImage(persons, objects) {
    return persons.map(p => {
      if (!p.worldPose) return { ...p, ...NO_POSE_RESULT };
      const result = ASTRA_HAR.classifyStaticImage(p.worldPose, nearbyObjectLabels(p, objects));
      return { ...p, activity: result.activity, confidence: result.confidence, harReason: result.reason };
    });
  }

  async function refreshForCurrentMedia() {
    ensureTracker();
    tracker.reset();
    ASTRA_HAR.resetAll();
    const type = ASTRA_MEDIA.getType();
    cachedMockImageFrame = null;
    cachedRealImageFrame = null;

    if (type === 'image') {
      cachedMockImageFrame = ASTRA_DETECTION.generateImageDetections();
      if (detectionMode === 'REAL' && ASTRA_REAL_DETECTION.isReady() && realEls.img) {
        const frame = await ASTRA_REAL_DETECTION.detectImageAsync(realEls.img);
        // One-shot classification — a static image has no motion history, so
        // this runs once here rather than every poll tick (the result can't
        // change without new pixels).
        frame.persons = applyHarImage(frame.persons, frame.objects);
        cachedRealImageFrame = frame;
      }
      return;
    }

    if ((type === 'video' || type === 'camera') && detectionMode === 'REAL' && ASTRA_REAL_DETECTION.isReady()) {
      await ASTRA_REAL_DETECTION.prepareForVideo();
    }
  }

  function setDetectionMode(m) {
    if (m !== 'REAL' && m !== 'SIMULATED') return;
    if (m === detectionMode) return;
    detectionMode = m;
    refreshForCurrentMedia();
    notifyModeChange();
  }

  function getDetectionMode() { return detectionMode; }
  function isRealDetectionReady() { return ASTRA_REAL_DETECTION.isReady(); }
  function getRealDetectionError() { return ASTRA_REAL_DETECTION.getUnsupportedReason(); }

  function initRealDetectionEagerly() {
    ASTRA_REAL_DETECTION.init().then((res) => {
      if (res.ok) {
        refreshForCurrentMedia();
      } else if (detectionMode === 'REAL') {
        // Real CV unavailable (e.g. opened via file:// instead of a local server) — fall back honestly.
        detectionMode = 'SIMULATED';
        refreshForCurrentMedia();
      }
      notifyModeChange();
    });
  }

  function computeFrame() {
    ensureTracker();
    const type = ASTRA_MEDIA.getType();
    const useReal = detectionMode === 'REAL' && ASTRA_REAL_DETECTION.isReady();

    if (type === 'image') {
      const f = (useReal ? cachedRealImageFrame : cachedMockImageFrame) || { persons: [], objects: [] };
      return { timestamp: new Date().toISOString(), persons: f.persons, objects: f.objects };
    }

    if (type === 'video' || type === 'camera') {
      if (useReal && realEls.video) {
        const raw = ASTRA_REAL_DETECTION.detectVideoFrameSync(realEls.video, Math.round(performance.now()));
        const tracked = tracker.update([...raw.persons, ...raw.objects]);
        const objects = tracked.filter(x => x.kind === 'object');
        const persons = applyHarVideo(tracked.filter(x => x.kind === 'person'), objects);
        return { timestamp: new Date().toISOString(), persons, objects };
      }
      const t = performance.now() / 1000;
      const { persons, objects } = ASTRA_DETECTION.generateLiveCandidates(t);
      const tracked = tracker.update([...persons, ...objects]);
      return {
        timestamp: new Date().toISOString(),
        persons: tracked.filter(x => x.kind === 'person'),
        objects: tracked.filter(x => x.kind === 'object'),
      };
    }

    return { timestamp: new Date().toISOString(), persons: [], objects: [] };
  }

  /* ---------------------------------------------------------------------
     Public API — this is the surface the rest of the frontend calls.
     Every function returns a Promise, matching the shape a fetch() call
     would return, so swapping mock -> live requires no caller changes.
     --------------------------------------------------------------------- */

  function connectWebSocket(onFrame) {
    if (!subscribedToMedia) {
      subscribedToMedia = true;
      ASTRA_MEDIA.subscribe(refreshForCurrentMedia);
      refreshForCurrentMedia();
      initRealDetectionEagerly();
    }
    // LIVE MODE (future): socket = new WebSocket(CONFIG.wsUrl);
    // socket.onmessage = (evt) => onFrame(JSON.parse(evt.data));
    if (socketInterval) clearInterval(socketInterval);
    socketInterval = setInterval(() => {
      if (!analysisRunning) return;
      onFrame(computeFrame());
    }, 150); // ~6.6 Hz — a realistic inference cadence; canvas redraw itself still runs at 60fps
    return Promise.resolve({ status: 'connected', mode: CONFIG.mode });
  }

  function disconnectWebSocket() {
    if (socketInterval) clearInterval(socketInterval);
    socketInterval = null;
  }

  function getCurrentActivity() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/activity`).then(r => r.json());
    return Promise.resolve(computeFrame());
  }

  function getDetections() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/detections`).then(r => r.json());
    return Promise.resolve(computeFrame().objects);
  }

  function getPose() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/pose`).then(r => r.json());
    const frame = computeFrame();
    return Promise.resolve(frame.persons.map(p => ({ person_id: p.id, keypoints: p.pose })));
  }

  function getTracking() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/tracking`).then(r => r.json());
    const frame = computeFrame();
    return Promise.resolve([
      ...frame.persons.map(p => ({ id: ASTRA_ACTIVITY.formatPersonId(p.id), type: 'person', confidence: p.confidence })),
      ...frame.objects.map(o => ({ id: `OBJECT #${o.id}`, type: o.label, confidence: o.confidence })),
    ]);
  }

  function getExperimentStatus() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/experiment`).then(r => r.json());
    return Promise.resolve(window.ASTRA_EXPERIMENT ? window.ASTRA_EXPERIMENT.getStatus() : null);
  }

  function getSystemMetrics() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/system`).then(r => r.json());
    const jitter = (base, spread) => Math.max(0, Math.min(100, base + (Math.random() * 2 - 1) * spread));
    return Promise.resolve({
      cpu: jitter(42, 8),
      gpu: jitter(68, 6),
      ram: jitter(61, 5),
      vram: jitter(54, 6),
      inference_fps: Math.round(jitter(30, 1)),
      latency_ms: Math.round(jitter(42, 6)),
      yolo_fps: Math.round(jitter(31, 1)),
      pose_fps: Math.round(jitter(30, 1)),
      har_fps: Math.round(jitter(28, 1)),
      model: 'HAR-v1.0',
      temporal_model: 'LSTM',
      device: 'EDGE AI DEVICE',
    });
  }

  function startAnalysis() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/analysis/start`, { method: 'POST' });
    analysisRunning = true;
    return Promise.resolve({ status: 'started' });
  }

  function stopAnalysis() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/analysis/stop`, { method: 'POST' });
    analysisRunning = false;
    return Promise.resolve({ status: 'stopped' });
  }

  function isAnalysisRunning() {
    return analysisRunning;
  }

  function getEventLog() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/events`).then(r => r.json());
    return Promise.resolve(window.ASTRA_EXPERIMENT ? window.ASTRA_EXPERIMENT.getEventLog() : []);
  }

  function createExperiment(payload) {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/experiment/create`, {
    //   method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    // }).then(r => r.json());
    return Promise.resolve({ status: 'created', experiment: payload });
  }

  function resetExperiment() {
    // LIVE: return fetch(`${CONFIG.apiBase}/api/experiment/reset`, { method: 'POST' });
    return Promise.resolve({ status: 'reset' });
  }

  function tryConnectBackend(apiBase, wsUrl) {
    CONFIG.apiBase = apiBase || CONFIG.apiBase;
    CONFIG.wsUrl = wsUrl || CONFIG.wsUrl;
    return fetch(`${CONFIG.apiBase}/api/status`, { method: 'GET', mode: 'cors' })
      .then(r => r.json())
      .then(data => {
        CONFIG.mode = 'LIVE';
        return { connected: true, mode: 'LIVE', data };
      })
      .catch(() => {
        CONFIG.mode = 'MOCK';
        return { connected: false, mode: 'MOCK' };
      });
  }

  function getMode() {
    return CONFIG.mode;
  }

  return {
    CONFIG,
    connectWebSocket,
    disconnectWebSocket,
    getCurrentActivity,
    getDetections,
    getPose,
    getTracking,
    getExperimentStatus,
    getSystemMetrics,
    startAnalysis,
    stopAnalysis,
    isAnalysisRunning,
    getEventLog,
    createExperiment,
    resetExperiment,
    tryConnectBackend,
    getMode,
    setDetectionMode,
    getDetectionMode,
    isRealDetectionReady,
    getRealDetectionError,
    onModeChange,
    setRealDetectionElements,
  };
})();
