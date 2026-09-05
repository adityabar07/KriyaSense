# SIH 2026 --- KriyaSense

## Master Project Context & Implementation Blueprint

**Team:** Astrocrew\
**Members:** Arup (Co-Leader), Aditya, Rajarshi, Tamasi, Sangsaptak,
Suman\
**SIH Problem:** PS 174 / SIH26174\
**Project:** KriyaSense --- AI Human Activity Recognition for On-board BAS
Experiments

> This file is the single source of truth for Claude, Google
> Antigravity, and the human team.

## 1. Core Objective

KriyaSense is **not generic Human Activity Recognition**. It is a
task-specific, offline, real-time **on-board experiment assistant**.

Core intelligence:

**Observe → Understand → Validate → Warn → Record**

The system observes a predefined BAS experiment through fixed-payload
cameras, detects the operator and experiment objects, understands pose
and hand-object interactions, recognizes experiment steps over time,
validates the prescribed sequence, warns about
skipped/out-of-order/invalid actions, suggests the next step, creates
lightweight timestamped logs, records video, supports IP streaming, and
runs locally/offline.

## 2. Critical Requirement: Official Experiment Protocol

The available problem description begins with a box containing red and
yellow smaller boxes, but the complete official sequence must be taken
from the authoritative SIH PS 174 statement.

**Never invent the remaining steps.**

Before large-scale training create:

`docs/EXPERIMENT_PROTOCOL.md`

For each official step define: - Step ID and name - Description -
Required object - Expected hand/object interaction - Start condition -
Completion condition - Failure conditions - Voice message - Next valid
step - Recovery behavior

These definitions become the ground truth for dataset labels, training,
state-machine logic, evaluation, GUI and alerts.

## 3. End-to-End Architecture

``` text
FIXED PAYLOAD CAMERA
        ↓
VIDEO CAPTURE
(OpenCV / GStreamer)
        ↓
PERCEPTION
├── YOLO Object Detection
├── Object Tracking
├── Pose Estimation
└── Hand/Object Interaction
        ↓
FEATURE / TEMPORAL LAYER
├── Object positions/velocity
├── Wrist/pose features
├── Hand-object distance
└── Interaction states
        ↓
TEMPORAL ACTIVITY MODEL
Rule baseline → LSTM/GRU → Transformer if justified
        ↓
EXPERIMENT STATE MACHINE
Expected Step ↔ Observed Step → Validate
        ↓
┌──────────────┬──────────────┬──────────────┐
NEXT STEP      VOICE ALERT    EVENT LOG
        └──────────────┬──────────────┘
                       ↓
                     GUI
              ┌────────┴────────┐
              ↓                 ↓
       LOCAL RECORDING     IP STREAMING

OPTIONAL ADVANCED:
3D Human Mesh Recovery
        ↓
Payload-relative pose/orientation
```

## 4. AI Modules

### Object Detection

Start with a lightweight YOLO-family detector. Detect the person,
experiment container, official experiment objects, target areas and
tools.

### Tracking

Use ByteTrack, BoT-SORT, or equivalent. Stable IDs support movement,
interaction and temporal reasoning.

### Pose

Candidate: MediaPipe Pose or YOLO Pose. Important keypoints include
shoulders, elbows, wrists, hips and head. Wrists are especially
important.

### Hand/Object Interaction

Start with explainable geometric + temporal features:

``` text
distance(wrist, object_center)
object displacement
object velocity
object entering/leaving container
object entering target area
```

Use these to infer events such as PICK, MOVE, PLACE, OPEN and CLOSE
where applicable.

### Temporal Activity Recognition

Progression: 1. Rule-based baseline 2. LSTM/GRU over extracted features
3. Temporal Transformer only if dataset/performance justifies it

Do not train a huge end-to-end video model merely for buzzwords.

### Sequence Validation

AI answers **"What is happening?"**\
The deterministic state machine answers **"Is it valid now?"**

This separation is mandatory because it improves explainability,
reliability and testing.

## 5. Confidence & Uncertainty

Never trigger an action from one uncertain frame.

Use: - confidence thresholds - moving averages - majority voting -
minimum-duration thresholds - temporal smoothing - evidence fusion

Conceptual fusion:

``` text
0.40 × temporal model
+ 0.25 × object evidence
+ 0.20 × pose/hand evidence
+ 0.15 × state consistency
```

Weights are starting points only and must be experimentally tuned.

When confidence is low, prefer:

**"Action uncertain --- observing."**

Do not immediately declare an error.

## 6. Voice, Logging, Recording & Streaming

### Voice

Use offline TTS. Cloud APIs must not be mandatory.

Examples: - step completed + next step - skipped-step warning -
out-of-order warning - wrong-object warning

### Logs

Generate lightweight timestamped: - TXT - CSV - JSON

Record experiment ID, timestamp, step, confidence, status and
error/recovery events.

### Video

Store: - raw camera feed - optional annotated feed

### IP Streaming

Support an environment-appropriate local protocol such as
RTSP/RTP/MJPEG. Keep streaming independent from AI inference.

## 7. GUI / UI/UX

Build a professional mission-monitoring dashboard.

Must show: - live/annotated video - current step - expected next step -
detected action - confidence - expected sequence - observed sequence -
status - alert/event timeline - START / STOP / RESET - log download -
recording/stream status

Design principles: - mission-control inspired - clear hierarchy - low
clutter - readable status - responsive - meaningful animation only -
explicit error/uncertainty states

## 8. Tech Stack

### AI / CV

-   Python
-   PyTorch
-   OpenCV
-   Ultralytics/YOLO
-   MediaPipe Pose or YOLO Pose
-   NumPy
-   Pandas
-   scikit-learn where useful
-   LSTM/GRU; Transformer only if justified

### Tracking

-   ByteTrack / BoT-SORT

### Annotation

-   CVAT / Roboflow / Label Studio

### Backend

-   FastAPI
-   Uvicorn
-   WebSocket

### Frontend

-   React
-   Vite
-   JavaScript/TypeScript
-   Tailwind CSS

### Video

-   OpenCV
-   FFmpeg/GStreamer when required

### Voice

-   Offline TTS

### Packaging

-   Docker optionally
-   PyInstaller or reproducible packaged Python environment where
    practical

Do not introduce unnecessary microservices or trendy technologies
without measurable benefit.

## 9. Hardware

Minimum: - laptop/desktop - 1080p USB webcam - rigid tripod/mount -
experiment props - adequate SSD storage

Preferred: - NVIDIA GPU with adequate VRAM - 16--32 GB RAM - SSD -
1080p/60 FPS camera if available - controlled lighting - optional second
camera

After the software baseline works, evaluate an NVIDIA Jetson-class edge
device if available.

## 10. Offline-First Requirement

The final core system must run without internet.

Local components: - models - inference - state machine - TTS - logging -
recording - GUI - core APIs

Cloud services may assist development, but the final core inference must
not depend on them.

## 11. Custom Dataset Strategy

The dataset must be specific to this experiment.

Best workflow:

``` text
Official experiment
      ↓
Physical local replica
      ↓
Fixed webcam
      ↓
Multiple participants
      ↓
Correct + incorrect trials
      ↓
Object + temporal annotation
      ↓
Train / Validation / Test
```

Target 5--10 participants; start with 3--5 if necessary.

Include variation in: - people/body size/clothing - right/left
handedness - slow/normal/fast motion - mild lighting variation - small
valid spatial variation

### Trial categories

-   correct
-   skipped step
-   wrong order
-   wrong object
-   repeated step
-   invalid action
-   partial/hesitation
-   recovery after warning

Initial planning target: 50--100 pilot videos, then approximately
150--300 complete trials. These are engineering targets, not official
SIH requirements.

## 12. Dataset Split

Never randomly split near-identical frames from the same video.

Prefer participant-separated splits:

``` text
Participants A/B/C → Train
Participant D      → Validation
Participant E      → Test
```

Keep complete trials together. Test on unseen participants.

## 13. Annotation Layers

1.  **Objects:** bounding boxes for person and official objects.
2.  **Pose:** generated by a pose estimator initially.
3.  **Interaction:** reach/contact/pick/move/place/release/open/close
    where applicable.
4.  **Activity:** map to official S1...SN step IDs.
5.  **Sequence:** expected vs observed sequence and error type.

Example:

``` text
Expected: S1 → S2 → S3 → S4
Observed: S1 → S2 → S4
Result:   S3 SKIPPED
```

## 14. Dataset Structure

``` text
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

## 15. Repository Structure

``` text
astra-h/
├── README.md
├── SIH_CONTEXT.md
├── LICENSE
├── .gitignore
├── .env.example
├── docs/
│   ├── EXPERIMENT_PROTOCOL.md
│   ├── ARCHITECTURE.md
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

## 16. Configuration-Driven Experiment

Do not hard-code all steps into Python.

Use:

`configs/experiment.yaml`

``` yaml
experiment_name: BAS_OFFICIAL_EXPERIMENT
steps:
  - id: S1
    name: OFFICIAL_STEP_NAME_1
  - id: S2
    name: OFFICIAL_STEP_NAME_2
```

Replace placeholders only after the official sequence is verified.

This makes the experiment engine reusable.

## 17. Development Phases

### Phase 0 --- Understand & Freeze

Verify PS, exact protocol, objects, steps and success/failure
conditions.

### Phase 1 --- Physical Setup

Build the experiment replica, mount the camera and record 10--20 pilot
videos.

### Phase 2 --- Dataset Pipeline

Finalize recording, annotation, metadata and split policy.

### Phase 3 --- Object Detection

Train and evaluate lightweight YOLO detector.

### Phase 4 --- Tracking

Add stable object tracking.

### Phase 5 --- Pose & Interaction

Add pose and hand-object interaction events.

### Phase 6 --- Activity Recognition

Build rule baseline, then LSTM/GRU.

### Phase 7 --- State Machine

Implement expected/observed validation,
skip/out-of-order/wrong-object/recovery logic.

### Phase 8 --- Confidence & Uncertainty

Add temporal smoothing, evidence fusion and false-alert reduction.

### Phase 9 --- Voice & Logging

Add offline TTS and TXT/CSV/JSON event logs.

### Phase 10 --- GUI

Build live monitoring dashboard.

### Phase 11 --- Recording & IP Streaming

Add local recording and required network stream.

### Phase 12 --- Offline Packaging

Disconnect internet and verify the complete system.

### Phase 13 --- Optimization

Only after accuracy is stable: ONNX/TensorRT, FP16/INT8, ROI processing,
frame skipping and asynchronous inference as appropriate.

### Phase 14 --- Advanced Space Extension

Optional orientation-agnostic 3D HMR and payload-relative coordinate
transformation.

## 18. Evaluation

### Object Detection

Precision, Recall, mAP.

### Activity Recognition

Accuracy, Precision, Recall, F1, confusion matrix.

### Sequence Validation

-   correct-sequence accuracy
-   skipped-step detection rate
-   out-of-order detection rate
-   wrong-object detection rate
-   false-alert rate

### System

-   FPS
-   end-to-end latency
-   CPU/GPU usage
-   RAM usage

### Alerts

-   alert latency
-   correct alert rate

False-warning rate is a key metric. Do not report accuracy alone.

## 19. Testing Matrix

Test: - correct sequence - skipped step - wrong order - wrong object -
repeated step - slow operator - fast operator - unseen person -
left-handed operator - mild lighting changes - partial occlusion -
slight object displacement where valid - recovery after error

## 20. SIH Demo

### Demo 1 --- Correct

All steps complete → `STATUS: SUCCESS`.

### Demo 2 --- Skipped Step

Expected S3, observed S4 → GUI warning + voice warning.

### Demo 3 --- Wrong Object

Expected object differs from observed object → warning.

### Demo 4 --- Recovery

Operator completes missing step → system accepts it and resumes →
`EXPERIMENT RECOVERED`.

The demo should emphasize real-time behavior, explainability and
operational usefulness.

## 21. SIH Pitch Structure

1.  Problem
2.  Space/onboard constraint
3.  Existing limitation
4.  KriyaSense solution
5.  Architecture
6.  Custom dataset
7.  AI pipeline
8.  Sequence validation
9.  Offline/edge design
10. Innovation / USP
11. Evaluation
12. Live demo
13. Advanced 3D extension
14. Impact/scalability

Core statement:

> KriyaSense is an onboard experiment intelligence and protocol-validation
> system, not merely a Human Activity Recognition classifier.

## 22. Key USP

-   Task-specific experiment intelligence
-   Multi-signal perception: objects + tracking + pose + interaction +
    temporal context
-   Neural activity recognition plus deterministic protocol validation
-   Offline-first operation
-   Explainable warnings and next-step assistance
-   Compact event logging instead of relying on continuous raw-video
    transmission
-   Future payload-relative 3D pose support

## 23. Team Responsibilities

**Arup --- Co-Leader:** project coordination, AI/ML architecture,
integration, technical decisions, SIH strategy, final review.

**Aditya:** backend/API, inference integration, WebSocket, state-machine
integration.

**Rajarshi:** dataset collection, physical setup support, annotation,
metadata, data quality.

**Tamasi:** model training, temporal activity recognition, evaluation,
experiments.

**Sangsaptak:** frontend, UI/UX, monitoring dashboard, visualization.

**Suman:** testing, deployment, video recording/streaming,
documentation, demo support.

Responsibilities overlap; everyone must understand the whole system.

## 24. Claude Operating Role

Claude acts as: - senior technical architect - ML/research lead - code
reviewer - experiment planner - documentation reviewer - SIH strategy
advisor

Claude should verify assumptions, research authoritative facts when
needed, explain tradeoffs, identify risks, avoid fabricated
datasets/metrics/results, and critically review code.

Claude must not invent experiment steps or blindly generate complex ML
code.

## 25. Antigravity Operating Role

Antigravity acts as: - implementation engineer - frontend engineer -
backend engineer - integration engineer - testing/debug agent -
browser/UI verification agent

Before changes: 1. Read `SIH_CONTEXT.md`. 2. Inspect repository. 3.
Preserve working code. 4. Work incrementally. 5. Run/test after
meaningful changes. 6. Keep mocks isolated. 7. Never fake real inference
unless explicitly marked mock/demo mode. 8. Validate API contracts. 9.
Keep secrets out of Git. 10. Report changes and tests.

Scientific/ML ambiguity must be flagged rather than silently assumed.

## 26. Human Team Responsibility

Humans own: - official requirement verification - experiment protocol
approval - dataset collection - data/licensing decisions - model
validation - final code review - hardware - SIH submission -
presentation and judging

AI agents are assistants, not the source of truth.

## 27. Git & Security Rules

-   Everyone must have GitHub and Git installed.
-   Do not push directly to `main`.
-   Use branches and Pull Requests.
-   Review before merge.
-   Meaningful commit messages.
-   Never commit `.env`, API keys, passwords, tokens, private
    credentials, private datasets or secrets.
-   Keep `.env.example`.
-   Keep `.gitignore` comprehensive.

## 28. Local Setup

Required: - Git - GitHub account - Python project-approved stable
version - Node.js LTS - VS Code or preferred IDE - Claude account -
Google Antigravity access

AI/CV: - PyTorch - OpenCV - Ultralytics/YOLO - pose library - NumPy -
Pandas - scikit-learn if required

Frontend: - Node.js + npm/pnpm as agreed - React + Vite + Tailwind

Backend: - FastAPI + Uvicorn

Optional: - Docker - FFmpeg/GStreamer - CUDA/TensorRT on compatible
NVIDIA systems

Lock dependency versions after the first verified development
environment.

## 29. Definition of Done

### Frontend

UI, loading/error states, responsive behavior and browser testing
complete.

### Backend

Endpoints, validation, error handling, meaningful logs and critical
tests complete.

### AI

Reproducible preprocessing/inference, versioned model, real evaluation
and no fabricated metrics.

### Dataset

Custom trials, multiple participants, participant-separated splits,
object and temporal annotations.

### Runtime

Live camera, current/next step, alerts, logs, recording and IP streaming
where required.

### Offline

Models, inference, TTS, GUI, logging and recording work without
internet.

## 30. Priority Order

When time is limited:

1.  Official PS understanding
2.  Exact experiment protocol
3.  Dataset quality
4.  Reliable perception
5.  Activity recognition
6.  Sequence validation
7.  False-alert reduction
8.  End-to-end offline inference
9.  Evaluation
10. Demo reliability
11. GUI polish
12. Advanced 3D features
13. Fancy animations

A beautiful UI cannot compensate for unreliable AI.

## 31. Immediate Next Actions

1.  Verify the complete official PS 174 experiment sequence.
2.  Create `docs/EXPERIMENT_PROTOCOL.md`.
3.  Freeze official object/action classes and step IDs.
4.  Build physical experiment setup.
5.  Record 10--20 pilot videos.
6.  Validate camera framing and annotation workflow.
7.  Train the first detector.
8.  Build the end-to-end MVP.
9.  Add temporal learning after the baseline is reliable.
10. Add advanced 3D features only after the core system works.

## 32. Final North Star

> **KriyaSense is a practical onboard AI experiment assistant that
> understands what the operator is doing, knows what should happen next,
> detects protocol violations, assists the operator, and produces a
> lightweight operational record --- locally and in real time.**

**KriyaSense: Observe → Understand → Validate → Warn → Record**

## 33. AI Agent Source-of-Truth Rules

-   Treat this file as the project source of truth.
-   Do not casually change the core problem definition.
-   Never invent official experiment steps.
-   Separate confirmed requirements from assumptions.
-   Prefer simple, measurable, testable solutions.
-   Do not add technology merely for buzzwords.
-   Never fabricate datasets, metrics, results, citations or deployment
    claims.
-   Preserve modularity and offline operation.
-   Prefer reproducible experiments.
-   Explicitly identify risks.
-   Review AI-generated code critically.
-   Keep mocks separate from real inference.
-   Inspect the current repository before major changes.
-   Report what changed, why, and what was tested.
-   Optimize for a reliable SIH prototype and credible
    scientific/technical claims.
