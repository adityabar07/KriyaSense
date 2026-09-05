# KriyaSense — System Architecture

**Reference:** `PRD.md` (requirements), `PHASES.md` (build order), `RULES.md` (constraints).

---

## 1. Architectural Principles

1. **Separation of concerns:** the neural activity model answers *"what is happening?"*; the deterministic state machine answers *"is it valid?"*. These are never merged into one opaque model.
2. **Offline-first:** every component that runs during the actual experiment must function with zero network access.
3. **Configuration over hard-coding:** the experiment protocol lives in `configs/experiment.yaml`, not scattered across Python conditionals.
4. **Explainability over cleverness:** every alert must be traceable to a rule and a piece of evidence.
5. **Progressive complexity:** rule-based → LSTM/GRU → Transformer, only escalating when justified by measured need.
6. **Streaming/recording independence:** I/O (recording, IP streaming) must never block or degrade the inference loop.

---

## 2. End-to-End Data Flow

```
FIXED PAYLOAD CAMERA
        │
        ▼
VIDEO CAPTURE (OpenCV / GStreamer)
        │
        ▼
PERCEPTION LAYER
 ├─ Object Detection (YOLO-family)
 ├─ Object/Operator Tracking (ByteTrack / BoT-SORT)
 ├─ Pose Estimation (MediaPipe Pose / YOLO Pose)
 └─ Hand-Object Interaction (geometric + temporal features)
        │
        ▼
FEATURE / TEMPORAL LAYER
 ├─ Object position/velocity
 ├─ Wrist/pose features
 ├─ Hand-object distance
 └─ Interaction state (PICK/MOVE/PLACE/OPEN/CLOSE)
        │
        ▼
TEMPORAL ACTIVITY MODEL
 Rule baseline → LSTM/GRU → Transformer (only if justified)
        │
        ▼
CONFIDENCE & EVIDENCE FUSION
        │
        ▼
EXPERIMENT STATE MACHINE
 Expected Step (from configs/experiment.yaml) ↔ Observed Step → Validate
        │
   ┌────┼────────────────┬───────────────┐
   ▼    ▼                ▼               ▼
NEXT STEP   VOICE ALERT (offline TTS)   EVENT LOG (TXT/CSV/JSON)
   │    │                │               │
   └────┴────────┬───────┴───────────────┘
                 ▼
              BACKEND (FastAPI + WebSocket)
                 │
        ┌────────┼─────────┐
        ▼                  ▼
   FRONTEND GUI      LOCAL RECORDING + IP STREAMING
   (React/Vite/Tailwind)   (independent of inference loop)

OPTIONAL ADVANCED (Phase 14):
3D Human Mesh Recovery → Payload-relative pose/orientation
```

---

## 3. Component Responsibilities

### 3.1 Video Capture
- Reads frames from the fixed camera at a configured resolution/FPS.
- Hands frames to the perception layer via an in-process queue; never blocks on downstream slowness (drop-oldest-frame policy under backpressure).

### 3.2 Perception Layer
- **Object Detection:** Ultralytics/YOLO model, classes = {operator, official experiment objects, tools, target/container zones}. Output: bounding boxes + class + confidence.
- **Tracking:** assigns stable IDs to detections across frames (ByteTrack/BoT-SORT), required for interaction and displacement reasoning.
- **Pose Estimation:** MediaPipe Pose or YOLO Pose; keypoints of interest = shoulders, elbows, wrists, hips, head, with wrists weighted most heavily for interaction inference.
- **Hand-Object Interaction:** derives explainable geometric/temporal signals:
  ```
  distance(wrist, object_center)
  object displacement
  object velocity
  object entering/leaving container
  object entering target area
  ```
  These combine into discrete interaction events (PICK, MOVE, PLACE, OPEN, CLOSE) as relevant to the frozen protocol.

### 3.3 Feature / Temporal Layer
- Aggregates per-frame perception outputs into a rolling feature window (object positions/velocities, wrist features, hand-object distances, interaction states) consumed by the activity model.

### 3.4 Temporal Activity Model
- **Baseline:** deterministic rules mapping interaction-event sequences to step IDs — must exist and be evaluated before any learned model is trusted.
- **LSTM/GRU:** trained on extracted features (not raw video) once sufficient annotated trials exist.
- **Transformer:** only introduced if the LSTM/GRU plateau is demonstrated and dataset size supports it. This must be justified in writing (see `RULES.md`), not adopted by default.

### 3.5 Confidence & Evidence Fusion
Conceptual starting formula (weights are placeholders, to be tuned experimentally against validation data — never presented as final without evidence):
```
confidence = 0.40 × temporal_model_score
           + 0.25 × object_evidence_score
           + 0.20 × pose_hand_evidence_score
           + 0.15 × state_consistency_score
```
Additional smoothing: confidence thresholds, moving averages, majority voting over a window, minimum-duration-before-transition rule. Below threshold → GUI/voice state = "Action uncertain — observing", never a false error.

### 3.6 Experiment State Machine
- Deterministic, rule-based, driven entirely by `configs/experiment.yaml`.
- Inputs: current observed step + confidence, current expected step, history.
- Outputs: `status` ∈ {IN_PROGRESS, STEP_COMPLETE, SKIPPED, OUT_OF_ORDER, WRONG_OBJECT, REPEATED, INVALID_ACTION, RECOVERED, SUCCESS}.
- This is the single authority for "is this valid" — the ML model never directly triggers an alert; it only feeds evidence into this machine.

### 3.7 Alerts / Voice
- Offline TTS engine (no cloud dependency) triggered by state machine transitions.
- Message templates keyed by transition type, populated from `EXPERIMENT_PROTOCOL.md` per-step voice message field.

### 3.8 Logging
- Every state transition appends a structured record: `{experiment_id, timestamp, step, confidence, status, event}`.
- Written concurrently to TXT (human-readable), CSV (tabular/analysis), and JSON (machine-readable/API).

### 3.9 Backend (FastAPI + Uvicorn + WebSocket)
- Owns the inference loop lifecycle (START/STOP/RESET).
- Publishes state updates over WebSocket to the frontend in real time.
- Exposes REST endpoints for: log download, historical trial retrieval, recording/stream status, configuration read (not write, in the MVP — protocol edits are a controlled, out-of-band action).
- See `docs/API.md` (to be written once endpoints are finalized in Phase 7–9) for the full contract.

### 3.10 Frontend (React + Vite + Tailwind)
- Subscribes to the WebSocket state stream.
- Renders the mission-control dashboard per `DESIGN.md`.
- Never computes validation logic itself — it is a pure presentation layer over backend state.

### 3.11 Recording & IP Streaming
- Recording: OpenCV/FFmpeg writes raw (and optionally annotated) frames to local storage, on a separate thread/process from inference.
- Streaming: local RTSP/RTP/MJPEG (or environment-appropriate protocol) server, also decoupled — a stalled stream client must never stall inference.

---

## 4. Dataset Architecture

### 4.1 Collection Pipeline
```
Official experiment
      │
Physical local replica
      │
Fixed webcam
      │
Multiple participants
      │
Correct + incorrect trials
      │
Object + temporal annotation
      │
Train / Validation / Test
```
Target: 5–10 participants (3–5 minimum viable). Trial categories: correct, skipped step, wrong order, wrong object, repeated step, invalid action, partial/hesitation, recovery after warning.

### 4.2 Split Policy
Never split near-identical frames from the same video across sets. **Participant-separated split**, e.g.:
```
Participants A/B/C → Train
Participant D      → Validation
Participant E      → Test
```
Keep complete trials together; test only on unseen participants.

### 4.3 Annotation Layers
1. Objects — bounding boxes for person + official objects.
2. Pose — generated by pose estimator, spot-checked.
3. Interaction — reach/contact/pick/move/place/release/open/close.
4. Activity — mapped to official S1...SN step IDs (from `EXPERIMENT_PROTOCOL.md`).
5. Sequence — expected vs. observed, with error type where applicable.

Example:
```
Expected: S1 → S2 → S3 → S4
Observed: S1 → S2 → S4
Result:   S3 SKIPPED
```

### 4.4 Dataset Directory Structure
```
bas_har_dataset/
├── videos/{train,val,test}/
├── frames/{train,val,test}/
├── object_labels/{train,val,test}/
├── activity_annotations/{train,val,test}.csv
├── pose_features/{train,val,test}/
├── metadata/
│   ├── participants.csv
│   └── trials.json
└── README.md
```

---

## 5. Repository Structure

```
astra-h/
├── README.md
├── SIH_CONTEXT.md
├── LICENSE
├── .gitignore
├── .env.example
├── docs/
│   ├── EXPERIMENT_PROTOCOL.md
│   ├── PRD.md
│   ├── PHASES.md
│   ├── ARCHITECTURE.md
│   ├── MEMORY.md
│   ├── DESIGN.md
│   ├── RULES.md
│   ├── DATASET.md
│   ├── MODEL_CARD.md
│   ├── API.md
│   └── DEMO_SCRIPT.md
├── frontend/
├── backend/
│   ├── app/
│   └── requirements.txt
├── ai/
│   ├── detection/
│   ├── tracking/
│   ├── pose/
│   ├── interaction/
│   ├── activity/
│   ├── inference/
│   └── evaluation/
├── state_machine/
├── alerts/
├── video/
├── logging/
├── configs/
├── models/
├── evaluation/
├── scripts/
└── tests/
```

---

## 6. Configuration-Driven Experiment Engine

`configs/experiment.yaml` is the single source of protocol truth consumed by the state machine, GUI, and voice layer:

```yaml
experiment_name: BAS_OFFICIAL_EXPERIMENT
steps:
  - id: S1
    name: OFFICIAL_STEP_NAME_1
    required_object: OBJECT_A
    expected_interaction: PICK
    voice_message_on_complete: "Step 1 complete. Proceed to step 2."
  - id: S2
    name: OFFICIAL_STEP_NAME_2
    required_object: OBJECT_B
    expected_interaction: PLACE
    voice_message_on_complete: "Step 2 complete. Proceed to step 3."
```
Placeholders are replaced only after `EXPERIMENT_PROTOCOL.md` is frozen (Phase 0). The engine code must never assume a fixed number or order of steps — it reads structure from this file.

---

## 7. Deployment / Offline Packaging

- Development may use cloud tools (annotation platforms, docs, research), but the **final core inference path** (capture → perception → activity model → state machine → TTS → GUI → logging → recording) must run with no internet connection.
- Target packaging: reproducible Python environment (locked dependency versions) + optional Docker + optional PyInstaller bundling for the demo machine.
- Optional future target: NVIDIA Jetson-class edge device, evaluated only after the laptop/desktop baseline is proven (see `PHASES.md` Phase 13 note on hardware in `PRD.md` §9 of the source context).

---

## 8. Testing Matrix (Architectural Coverage)

The architecture must be validated against, at minimum:
correct sequence · skipped step · wrong order · wrong object · repeated step · slow operator · fast operator · unseen person · left-handed operator · mild lighting changes · partial occlusion · slight valid object displacement · recovery after error.

Each of these should map to an automated or scripted manual test in `tests/`.
