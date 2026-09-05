# KriyaSense — Development Phases

**Reference:** `PRD.md` for scope, `ARCHITECTURE.md` for technical detail, `RULES.md` for operating rules.
Each phase has an explicit **entry gate**, **exit criteria**, and **owner(s)**. Do not start a phase whose entry gate is unmet — flag it instead.

Legend for owners: **Arup** (AI/ML lead & coordination), **Aditya** (backend), **Rajarshi** (data), **Tamasi** (modeling/eval), **Sangsaptak** (frontend), **Suman** (test/deploy/recording/docs). Most phases need cross-role support — "Owner" = primary driver, not sole contributor.

---

## Phase 0 — Understand & Freeze
**Owner:** Arup + full team
**Entry gate:** SIH PS 174 statement available.
**Tasks:**
- Read the full official PS statement line by line as a team.
- Extract the exact experiment sequence, objects, tools, and target areas.
- Define pass/fail conditions per step.
- Write `docs/EXPERIMENT_PROTOCOL.md` (step ID, name, description, required object, expected hand/object interaction, start condition, completion condition, failure conditions, voice message, next valid step, recovery behavior).
- Freeze `configs/experiment.yaml` step IDs and names.
**Exit criteria:** `EXPERIMENT_PROTOCOL.md` reviewed and signed off by the whole team; no "TBD" steps remain.
**Blocks:** everything downstream. This is the single hardest gate in the project.

## Phase 1 — Physical Setup
**Owner:** Rajarshi + Suman
**Entry gate:** Phase 0 complete.
**Tasks:**
- Build a physical replica of the experiment setup matching the frozen protocol.
- Mount the camera rigidly (tripod / fixed mount), define fixed framing.
- Record 10–20 pilot videos covering at least the fully-correct trial.
- Check lighting consistency and camera FOV covers all required objects/zones.
**Exit criteria:** Pilot videos reviewed; framing and lighting confirmed workable for detection.

## Phase 2 — Dataset Pipeline
**Owner:** Rajarshi
**Entry gate:** Phase 1 pilot videos approved.
**Tasks:**
- Finalize recording protocol (resolution, FPS, duration, camera position variants if any).
- Set up annotation tooling (CVAT/Roboflow/Label Studio).
- Define metadata schema (`participants.csv`, `trials.json`).
- Define participant-separated split policy (see `ARCHITECTURE.md` §Dataset Split).
**Exit criteria:** Annotation workflow tested end-to-end on at least one pilot video; dataset folder structure created per `ARCHITECTURE.md` §Dataset Structure.

## Phase 3 — Object Detection
**Owner:** Tamasi + Rajarshi
**Entry gate:** First annotated batch of frames available.
**Tasks:**
- Train a lightweight YOLO-family detector on official objects + operator.
- Evaluate Precision/Recall/mAP honestly on a held-out validation split.
**Exit criteria:** Detector reaches an agreed minimum mAP (team to set a realistic, evidence-based number after first run — do not pre-commit to an arbitrary target); false detections on non-experiment objects are rare enough not to break downstream logic.

## Phase 4 — Tracking
**Owner:** Tamasi
**Entry gate:** Phase 3 detector usable in real time on dev hardware.
**Tasks:**
- Integrate ByteTrack or BoT-SORT (or equivalent) for stable object/operator IDs.
- Validate ID stability across occlusion and fast motion in pilot footage.
**Exit criteria:** ID switches are rare enough that downstream interaction logic remains reliable; documented failure cases.

## Phase 5 — Pose & Interaction
**Owner:** Tamasi + Arup
**Entry gate:** Phase 4 tracking stable.
**Tasks:**
- Integrate MediaPipe Pose or YOLO Pose.
- Implement geometric/temporal interaction features: wrist-object distance, object displacement/velocity, object entering/leaving container or target area.
- Derive PICK/MOVE/PLACE/OPEN/CLOSE events (only the ones relevant to the frozen protocol).
**Exit criteria:** Interaction events visibly and correctly fire on pilot footage for at least the fully-correct trial.

## Phase 6 — Activity Recognition
**Owner:** Tamasi
**Entry gate:** Phase 5 interaction events reliable; sufficient annotated trials available.
**Tasks:**
- Build the rule-based baseline mapping interaction sequences to official step IDs.
- Only after the baseline is evaluated: train LSTM/GRU over extracted features.
- Escalate to a Transformer **only if** justified by measured performance gaps and available data volume.
**Exit criteria:** Documented accuracy/F1/confusion matrix for the baseline (and any upgraded model), with honest discussion of failure modes.

## Phase 7 — State Machine
**Owner:** Aditya + Arup
**Entry gate:** Phase 6 baseline producing step predictions.
**Tasks:**
- Implement the deterministic expected-vs-observed validator per `configs/experiment.yaml`.
- Implement skip / out-of-order / wrong-object / repeated-step / invalid-action detection.
- Implement recovery logic (`RECOVERED` state).
**Exit criteria:** State machine correctly classifies all trial categories in a controlled test set (correct, skipped, wrong order, wrong object, repeated, invalid, recovery).

## Phase 8 — Confidence & Uncertainty
**Owner:** Tamasi + Arup
**Entry gate:** Phase 7 state machine functional.
**Tasks:**
- Implement confidence thresholds, moving averages, majority voting, minimum-duration thresholds.
- Implement the evidence fusion formula (starting weights in `ARCHITECTURE.md`, tuned experimentally).
- Ensure low-confidence frames resolve to "Action uncertain — observing", never a false error.
**Exit criteria:** Measured reduction in false-alert rate vs. the naive Phase 7 baseline, documented with numbers.

## Phase 9 — Voice & Logging
**Owner:** Aditya + Suman
**Entry gate:** Phase 8 confidence layer integrated.
**Tasks:**
- Integrate offline TTS for all alert categories.
- Implement TXT/CSV/JSON event logging (experiment ID, timestamp, step, confidence, status, error/recovery).
**Exit criteria:** A full trial run produces a complete, correct log file in all three formats, and correct voice alerts fire at the right moments.

## Phase 10 — GUI
**Owner:** Sangsaptak
**Entry gate:** Backend WebSocket/API contract stable (see `ARCHITECTURE.md` §API).
**Tasks:**
- Build the mission-control dashboard per `DESIGN.md`.
- Wire live video, current/next step, confidence, sequence comparison, alert timeline, controls, log download, recording/stream status.
**Exit criteria:** GUI reflects backend state with no perceptible lag or divergence; responsive on the demo display resolution; tested for all system states including error/uncertainty.

## Phase 11 — Recording & IP Streaming
**Owner:** Suman
**Entry gate:** Phase 10 GUI functional.
**Tasks:**
- Implement local raw + optional annotated video recording.
- Implement local IP streaming (RTSP/RTP/MJPEG or environment-appropriate protocol), decoupled from inference.
**Exit criteria:** Recording and streaming run concurrently with inference without degrading frame rate below the agreed threshold.

## Phase 12 — Offline Packaging
**Owner:** Suman + Aditya
**Entry gate:** All prior phases functional with network connected.
**Tasks:**
- Disconnect internet entirely.
- Verify models, inference, TTS, state machine, GUI, logging, and recording all function without any network call.
- Document exact offline setup steps.
**Exit criteria:** Full end-to-end trial completed successfully with no network connection.

## Phase 13 — Optimization
**Owner:** Tamasi + Aditya
**Entry gate:** Accuracy and reliability stable (post Phase 12).
**Tasks (only after accuracy is proven, not before):**
- ONNX/TensorRT export, FP16/INT8 quantization where applicable.
- ROI processing, frame skipping, asynchronous inference pipelines.
**Exit criteria:** Measured latency/throughput improvement with no meaningful accuracy regression, documented before/after.

## Phase 14 — Advanced Space Extension (Optional)
**Owner:** Arup + Tamasi
**Entry gate:** Core system (Phases 0–13) fully working and demo-ready.
**Tasks:**
- Orientation-agnostic 3D Human Mesh Recovery.
- Payload-relative coordinate transformation for pose.
**Exit criteria:** Only pursued if core system is already reliable — this is a differentiator for the pitch, not a dependency for the MVP.

---

## Phase Gate Discipline

- No phase begins if its entry gate is unmet — surface the blocker instead of improvising around it.
- Every phase exit requires a documented artifact (a file, a metric, a test result) — not a verbal "it works."
- If an AI coding agent (Claude/Antigravity) is asked to jump ahead of the current phase (e.g., build the GUI before the state machine exists), it must flag this rather than silently comply.
