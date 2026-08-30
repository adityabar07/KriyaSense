/* ==========================================================================
   experiment.js
   Owns the experiment sequence, the client-side Finite State Machine (FSM)
   simulation, sequence validation, violation handling, event logging and
   voice guidance. In the real system this logic is mirrored server-side
   in backend/experiment/fsm.py + validator.py — the frontend only ever
   *displays* what the backend FSM decides. Today it simulates that
   decision locally so the UI is fully demoable with zero backend.
   ========================================================================== */

const ASTRA_EXPERIMENT = (() => {

  const ACTIVITY_MASTER_LIST = [
    // BAS chemical-handling experiment actions (primary scenario)
    { code: 'PICK_UP', label: 'Pick Up' },
    { code: 'OPEN_CAP', label: 'Open Cap' },
    { code: 'DRAW_LIQUID', label: 'Draw Liquid' },
    { code: 'POUR_LIQUID', label: 'Pour Liquid' },
    { code: 'MIX', label: 'Mix' },
    { code: 'PLACE_BACK', label: 'Place Back' },
    // General activities (still available for custom builder sequences)
    { code: 'STAND', label: 'Stand' },
    { code: 'WALK', label: 'Walk' },
    { code: 'SIT', label: 'Sit' },
    { code: 'RUN', label: 'Run' },
    { code: 'PICK_OBJECT', label: 'Pick Object' },
    { code: 'PUT_OBJECT_DOWN', label: 'Put Object Down' },
    { code: 'READ', label: 'Read' },
    { code: 'WRITE', label: 'Write' },
    { code: 'USE_LAPTOP', label: 'Use Laptop' },
    { code: 'USE_PHONE', label: 'Use Phone' },
    { code: 'OPEN', label: 'Open' },
    { code: 'CLOSE', label: 'Close' },
    { code: 'REACH', label: 'Reach' },
    { code: 'CARRY', label: 'Carry' },
    { code: 'LIE_DOWN', label: 'Lie Down' },
  ];

  const GUIDANCE_TEXT = {
    PICK_UP: 'Pick up the chemical/dropper bottle from the payload rack.',
    OPEN_CAP: 'Open the bottle cap carefully.',
    DRAW_LIQUID: 'Use the syringe or pipette to draw liquid from the bottle.',
    POUR_LIQUID: 'Transfer the liquid drop-by-drop into the test tube.',
    MIX: 'Gently mix or stir the test tube contents.',
    PLACE_BACK: 'Place the equipment back in its original position on the rack.',
    STAND: 'Stand upright and remain stationary until posture is confirmed.',
    WALK: 'Walk steadily across the experiment area toward the workstation.',
    SIT: 'Lower yourself into the seated position at the workstation.',
    RUN: 'Move at a brisk, controlled pace across the module.',
    PICK_OBJECT: 'Reach toward the target object and pick it up.',
    PUT_OBJECT_DOWN: 'Place the object back down carefully on the surface.',
    READ: 'Pick up the reference material and read the procedure.',
    WRITE: 'Use the writing surface to record observations.',
    USE_LAPTOP: 'Open the laptop and interact with the onboard console.',
    USE_PHONE: 'Pick up the communication device and hold it to operate.',
    OPEN: 'Open the designated payload compartment.',
    CLOSE: 'Close the designated payload compartment securely.',
    REACH: 'Extend your arm toward the target object.',
    CARRY: 'Carry the object to the designated location.',
    LIE_DOWN: 'Move into the horizontal restrained position.',
  };

  const DEFAULT_SEQUENCE = ['PICK_UP', 'OPEN_CAP', 'DRAW_LIQUID', 'POUR_LIQUID', 'MIX', 'PLACE_BACK']
    .map(code => ({ code, label: labelFor(code) }));

  function labelFor(code) {
    const found = ACTIVITY_MASTER_LIST.find(a => a.code === code);
    return found ? found.label.toUpperCase() : code.replace(/_/g, ' ');
  }

  const state = {
    experimentName: 'BAS Chemical Handling Protocol',
    sequence: DEFAULT_SEQUENCE.slice(),
    currentIndex: 0,
    status: 'VALID',
    lastViolation: null,
    eventLog: [],
    timeline: [],
    voiceEnabled: true,
    completed: false,
  };

  const subscribers = [];
  function subscribe(fn) { subscribers.push(fn); }
  function notify() { subscribers.forEach(fn => fn(getStatus())); }

  function nowTime() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  function pushEvent(type, activity, confidence, expected, status) {
    state.eventLog.unshift({
      time: nowTime(), type, activity, confidence: `${confidence.toFixed(1)}%`, expected, status,
    });
    if (state.eventLog.length > 200) state.eventLog.pop();
  }

  function pushTimeline(text, cls) {
    state.timeline.unshift({ time: nowTime(), text, cls });
    if (state.timeline.length > 100) state.timeline.pop();
  }

  function speak(text) {
    if (!state.voiceEnabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.98;
      utter.pitch = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* speech synthesis unavailable — non-fatal for the demo */ }
  }

  function jitter(base, spread) {
    return Math.max(80, Math.min(99.9, base + (Math.random() * spread * 2 - spread)));
  }

  /* ------------------------------------------------------------------ */

  function getStatus() {
    const expectedStep = state.sequence[state.currentIndex] || null;
    return {
      experimentName: state.experimentName,
      sequence: state.sequence,
      currentIndex: state.currentIndex,
      currentStepNumber: Math.min(state.currentIndex + 1, state.sequence.length),
      totalSteps: state.sequence.length,
      expected: expectedStep ? expectedStep.label : '—',
      expectedCode: expectedStep ? expectedStep.code : null,
      status: state.status,
      lastViolation: state.lastViolation,
      completed: state.completed,
      voiceEnabled: state.voiceEnabled,
    };
  }

  function getEventLog() { return state.eventLog; }
  function getTimeline() { return state.timeline; }
  function getActivityMasterList() { return ACTIVITY_MASTER_LIST; }

  function getGuidance() {
    const expectedStep = state.sequence[state.currentIndex];
    if (!expectedStep || state.completed) {
      return { action: 'SEQUENCE COMPLETE', instruction: 'All experiment steps validated successfully. No further action required.' };
    }
    return {
      action: expectedStep.label,
      instruction: GUIDANCE_TEXT[expectedStep.code] || 'Proceed with the next protocol step.',
    };
  }

  function triggerActivity(code) {
    if (state.completed) return getStatus();
    const expectedStep = state.sequence[state.currentIndex];
    const confidence = jitter(95, 3);
    const label = labelFor(code);

    if (!expectedStep) return getStatus();

    if (code === expectedStep.code) {
      state.status = 'VALID';
      state.lastViolation = null;
      pushEvent('Activity', expectedStep.label, confidence, expectedStep.label, 'SUCCESS');
      pushTimeline(`✓ ${expectedStep.label}`, 'success');
      state.currentIndex += 1;
      if (state.currentIndex >= state.sequence.length) {
        state.completed = true;
        pushTimeline('✓ EXPERIMENT COMPLETE', 'success');
      }
    } else {
      state.status = 'INVALID';
      state.lastViolation = {
        expected: expectedStep.label,
        detected: label,
        step: state.currentIndex + 1,
        severity: 'HIGH',
      };
      pushEvent('Validation', label, confidence, expectedStep.label, 'VIOLATION');
      pushTimeline(`⚠ SEQUENCE VIOLATION`, 'violation');
      speak(`Warning. Sequence violation detected. Expected ${expectedStep.label} but ${label} was detected.`);
    }
    notify();
    return getStatus();
  }

  function simulateViolation() {
    if (state.completed) return getStatus();
    const expectedStep = state.sequence[state.currentIndex];
    if (!expectedStep) return getStatus();
    // Prefer a realistic "skipped a step" violation (performing the step
    // after next instead of the expected one); fall back to any other
    // known activity if the sequence is too short for that.
    const skipAhead = state.sequence[state.currentIndex + 2];
    const fallback = ACTIVITY_MASTER_LIST.find(a => a.code !== expectedStep.code);
    const wrong = skipAhead ? skipAhead.code : (fallback ? fallback.code : null);
    if (!wrong) return getStatus();
    return triggerActivity(wrong);
  }

  function reset() {
    state.currentIndex = 0;
    state.status = 'VALID';
    state.lastViolation = null;
    state.completed = false;
    pushTimeline('↺ EXPERIMENT RESET', 'success');
    pushEvent('System', '—', 100, '—', 'RESET');
    notify();
    return getStatus();
  }

  function setSequence(name, codes) {
    state.experimentName = name || 'Custom Experiment';
    state.sequence = codes.map(code => ({ code, label: labelFor(code) }));
    state.currentIndex = 0;
    state.status = 'VALID';
    state.lastViolation = null;
    state.completed = false;
    pushTimeline(`⚙ EXPERIMENT LOADED: ${state.experimentName}`, 'success');
    pushEvent('System', '—', 100, '—', 'LOADED');
    notify();
    return getStatus();
  }

  function setVoiceEnabled(v) { state.voiceEnabled = v; }

  function repeatGuidance() {
    const g = getGuidance();
    speak(`Next expected action: ${g.action}. ${g.instruction}`);
  }

  function exportEventLogTxt() {
    const lines = [
      'KRIYA-SENSE EXPERIMENT EVENT LOG',
      `Experiment: ${state.experimentName}`,
      `Exported: ${new Date().toString()}`,
      '='.repeat(70),
      'TIME       | TYPE        | ACTIVITY          | CONF   | EXPECTED          | STATUS',
      '-'.repeat(70),
      ...state.eventLog.map(e =>
        `${pad(e.time,10)} | ${pad(e.type,11)} | ${pad(e.activity,17)} | ${pad(e.confidence,6)} | ${pad(e.expected,17)} | ${e.status}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kriya-sense-event-log-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function pad(str, len) {
    str = String(str);
    return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
  }

  // Seed a couple of initial log/timeline entries for a populated first render.
  (function seed() {
    pushTimeline('⚙ SYSTEM INITIALIZED', 'success');
    pushEvent('System', '—', 100, '—', 'READY');
  })();

  return {
    subscribe,
    getStatus,
    getEventLog,
    getTimeline,
    getGuidance,
    getActivityMasterList,
    triggerActivity,
    simulateViolation,
    reset,
    setSequence,
    setVoiceEnabled,
    repeatGuidance,
    exportEventLogTxt,
    speak,
  };
})();

window.ASTRA_EXPERIMENT = ASTRA_EXPERIMENT;
