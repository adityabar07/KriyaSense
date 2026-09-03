<div align="center">
<img width="102" height="89" alt="logo" src="https://github.com/user-attachments/assets/1d209507-8e60-45c6-a651-4b2d301301ce" />

# KriyaSense

### AI Human Activity Recognition for On-board BAS Experiments

**Observe → Understand → Validate → Warn → Record**

An offline-first, real-time AI assistant that watches a Bharatiya Antariksh Station (BAS)-type on-board experiment, understands what the operator is doing, validates it against the official protocol, and guides the operator back on track the instant something goes wrong.

[![SIH 2026](https://img.shields.io/badge/SIH%202026-PS%20174%20%7C%20SIH26174-0070C0?style=flat-square)](https://sih.gov.in)
[![Theme](https://img.shields.io/badge/Theme-Space%20Technology-1F6FB2?style=flat-square)]()
[![Category](https://img.shields.io/badge/Category-Software-0B5AA0?style=flat-square)]()
[![Status](https://img.shields.io/badge/Status-Phase%200%20%7C%20Protocol%20Freeze-F5A623?style=flat-square)]()
[![Offline First](https://img.shields.io/badge/Offline-First-003D73?style=flat-square)]()
[![License](https://img.shields.io/badge/License-TBD-lightgrey?style=flat-square)]()

**Team Astrocrew** — Arup · Aditya · Rajarshi · Tamasi · Sangsaptak · Suman

</div>

---

## Table of Contents

- [About](#about)
- [Why KriyaSense Is Different](#why-kriyasense-is-different)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Project Status](#project-status)
- [Documentation](#documentation)
- [Getting Started](#getting-started)
- [Development Roadmap](#development-roadmap)
- [Evaluation Metrics](#evaluation-metrics)
- [Team](#team)
- [Contributing](#contributing)
- [Security & Data](#security--data)
- [References](#references)
- [License](#license)

---

## About

**Problem Statement:** PS 174 / SIH26174 — *AI Human Activity Recognition for On-board BAS Experiments*
**Theme:** Space Technology · **Category:** Software · **Event:** Smart India Hackathon 2026

On-board experiments in constrained environments (spacecraft cabins, analog space habitats, remote labs) are usually run by a single operator with no second pair of expert eyes. A skipped step, an out-of-order action, or the wrong object handled at the wrong time can silently invalidate results — and is often only caught during post-mission review, when it's too late to fix.

**KriyaSense** is a task-specific, offline, real-time on-board experiment assistant built to solve exactly this problem. It is **not** a generic Human Activity Recognition (HAR) demo — it is protocol intelligence for one certified experiment, engineered for explainability and operational reliability first.

> *KriyaSense doesn't just recognize activity — it understands protocol, and protects it.*

## Why KriyaSense Is Different

- **Protocol-specific, not generic HAR** — trained and validated against one official, certified experiment sequence, not an arbitrary activity vocabulary.
- **Explainable by design** — a neural model answers *"what is happening?"*; a separate, deterministic state machine answers *"is it valid right now?"*. Every alert traces back to a rule, never a black-box score.
- **Fully offline** — models, inference, voice, GUI, logging, and recording all run locally. No cloud dependency for the core loop, built for real connectivity-constrained environments.
- **Lightweight operational record** — compact timestamped TXT/CSV/JSON logs replace costly continuous video downlink.
- **False-alert-aware** — multi-signal evidence fusion and temporal smoothing mean the system says *"action uncertain — observing"* instead of guessing when confidence is low.

## How It Works

```text
FIXED PAYLOAD CAMERA
        │
        ▼
VIDEO CAPTURE  (OpenCV / GStreamer)
        │
        ▼
PERCEPTION LAYER
  ├── YOLO Object Detection
  ├── Object Tracking (ByteTrack / BoT-SORT)
  ├── Pose Estimation (MediaPipe Pose / YOLO Pose)
  └── Hand/Object Interaction (geometric + temporal features)
        │
        ▼
TEMPORAL ACTIVITY MODEL
  Rule baseline → LSTM/GRU → Transformer (only if justified)
        │
        ▼
EXPERIMENT STATE MACHINE
  Expected Step ↔ Observed Step → Validate
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   VOICE ALERT     EVENT LOG         GUI
        └──────────────┬──────────────┘
                        ▼
                LOCAL RECORDING + IP STREAMING
```

Full architectural rationale, data contracts, and deployment topology are documented in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Tech Stack

| Layer | Technology |
|---|---|
| **AI / Computer Vision** | Python, PyTorch, OpenCV, Ultralytics YOLO, MediaPipe Pose / YOLO Pose, NumPy, Pandas, scikit-learn |
| **Tracking** | ByteTrack / BoT-SORT |
| **Temporal Modeling** | Rule-based baseline → LSTM/GRU → Transformer (only if data/performance justify it) |
| **Backend** | FastAPI, Uvicorn, WebSocket |
| **Frontend** | React, Vite, Tailwind CSS |
| **Video** | OpenCV, FFmpeg / GStreamer |
| **Voice** | Offline TTS engine (no cloud dependency) |
| **Annotation** | CVAT / Roboflow / Label Studio |
| **Packaging** | Docker (optional), PyInstaller or a reproducible packaged Python environment |

No microservice sprawl and no technology adopted purely for buzzwords — every addition must have a measurable, stated benefit (see [`RULES.md`](./RULES.md)).

## Repository Structure

```text
astra-h/
├── README.md
├── SIH_CONTEXT_KriyaSense.md   # Ground-truth project brief
├── PRD.md                      # Product requirements
├── ARCHITECTURE.md             # System architecture & data contracts
├── PHASES.md                   # Phase-gated development roadmap
├── DESIGN.md                   # UI/UX design system
├── MEMORY.md                   # Living project memory / decision log
├── RULES.md                    # Team & AI-agent operating rules
├── LICENSE
├── .gitignore
├── .env.example
├── docs/
│   ├── EXPERIMENT_PROTOCOL.md  # Official step-by-step protocol (Phase 0 deliverable)
│   ├── DATASET.md
│   ├── MODEL_CARD.md
│   ├── API.md
│   └── DEMO_SCRIPT.md
├── frontend/                   # React + Vite + Tailwind dashboard
├── backend/
│   ├── app/                    # FastAPI + WebSocket service
│   └── requirements.txt
├── ai/
│   ├── detection/
│   ├── tracking/
│   ├── pose/
│   ├── interaction/
│   ├── activity/
│   ├── inference/
│   └── evaluation/
├── state_machine/               # Deterministic sequence validation
├── alerts/                      # Voice + confidence fusion
├── video/                       # Recording & IP streaming
├── logging/                     # TXT / CSV / JSON event logs
├── configs/
│   └── experiment.yaml          # Config-driven protocol definition
├── models/
├── evaluation/
├── scripts/
└── tests/
```

> Some directories above are scaffolding for the planned structure and may not exist yet in a fresh clone — check [`MEMORY.md`](./MEMORY.md) for the current, honest build status before assuming a module is implemented.

## Project Status

🚧 **Current phase: Phase 0 — Understand & Freeze.** No dataset collection, training, or protocol-dependent code has started yet. This is intentional: the official PS 174 experiment sequence must be confirmed and frozen into `docs/EXPERIMENT_PROTOCOL.md` before any downstream work begins — see [`RULES.md`](./RULES.md) §2 for why we treat this as a hard gate.

| Item | Status |
|---|---|
| Official PS 174 protocol confirmed | ❌ Not yet confirmed |
| `docs/EXPERIMENT_PROTOCOL.md` | ❌ Not yet created |
| `configs/experiment.yaml` | ❌ Placeholder only |
| Physical experiment replica | ❌ Not started |
| Pilot dataset | ❌ Not started |
| Object detector | ❌ Not started |
| Planning documentation (PRD/Architecture/Phases/Design/Rules/Memory) | ✅ Complete |

For the live, continuously-updated status, decision log, and open questions, see [`MEMORY.md`](./MEMORY.md) — read it before starting any new work on this repo.

## Documentation

| Document | What it covers |
|---|---|
| [`SIH_CONTEXT_KriyaSense.md`](./SIH_CONTEXT_KriyaSense.md) | The single source of truth for the entire project |
| [`PRD.md`](./PRD.md) | Problem statement, goals, requirements, MVP scope, success metrics |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System design, component responsibilities, data contracts, deployment topology |
| [`PHASES.md`](./PHASES.md) | Phase 0 → Phase 14 roadmap with owners and exit criteria |
| [`DESIGN.md`](./DESIGN.md) | UI/UX design system for the mission-monitoring dashboard |
| [`MEMORY.md`](./MEMORY.md) | Living project memory — current status, glossary, decision log, open questions |
| [`RULES.md`](./RULES.md) | Operating rules for the team and for AI coding agents (Claude, Antigravity) |

## Getting Started

> The environment below reflects the **planned** stack. Until Phase 0 closes and initial modules land, treat this as a setup reference, not a guarantee that every module is runnable yet — check [`MEMORY.md`](./MEMORY.md) first.

### Prerequisites

- Python 3.10+ (version to be locked after the first verified dev environment)
- Node.js LTS
- Git
- A CUDA-capable GPU is optional but recommended for training/inference speed
- 1080p USB webcam + tripod mount (for data collection and live testing)

### Clone

```bash
git clone https://github.com/<org>/astra-h.git
cd astra-h
```

### Backend (AI + API)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env     # fill in local config, never commit this file
uvicorn app.main:app --reload
```

### Frontend (Dashboard)

```bash
cd frontend
npm install
npm run dev
```

### Configuration

Experiment protocol, steps, and objects are defined in `configs/experiment.yaml` — **never hard-coded** into Python. Do not edit step definitions there until `docs/EXPERIMENT_PROTOCOL.md` has been finalized and human-approved.

## Development Roadmap

KriyaSense follows a strict phase-gated plan — see [`PHASES.md`](./PHASES.md) for full detail on owners and exit criteria per phase.

`Phase 0` Understand & Freeze → `Phase 1` Physical Setup → `Phase 2` Dataset Pipeline → `Phase 3` Object Detection → `Phase 4` Tracking → `Phase 5` Pose & Interaction → `Phase 6` Activity Recognition → `Phase 7` State Machine → `Phase 8` Confidence & Uncertainty → `Phase 9` Voice & Logging → `Phase 10` GUI → `Phase 11` Recording & Streaming → `Phase 12` Offline Packaging → `Phase 13` Optimization → `Phase 14` Advanced Space Extension (optional)

**Priority order when time is limited:** official PS understanding → exact protocol → dataset quality → reliable perception → activity recognition → sequence validation → false-alert reduction → offline inference → evaluation → demo reliability → GUI polish → advanced 3D features → animations. *A beautiful UI cannot compensate for unreliable AI.*

## Evaluation Metrics

KriyaSense is evaluated on more than raw accuracy — false-alert rate is a first-class metric throughout:

- **Detection:** Precision, Recall, mAP
- **Activity Recognition:** Accuracy, Precision, Recall, F1, confusion matrix
- **Sequence Validation:** correct-sequence accuracy, skipped-step / out-of-order / wrong-object detection rate, **false-alert rate**
- **System:** FPS, end-to-end latency, CPU/GPU/RAM usage
- **Alerts:** alert latency, correct-alert rate

No metric is reported in any document or demo unless it has actually been computed and is reproducible from a script in `evaluation/` — see [`RULES.md`](./RULES.md) §7.

## Team

| Member | Role |
|---|---|
| **Arup** (Co-Leader) | Project coordination, AI/ML architecture, integration, SIH strategy |
| **Aditya** | Backend/API, inference integration, WebSocket, state-machine integration |
| **Rajarshi** | Dataset collection, physical setup, annotation, data quality |
| **Tamasi** | Model training, temporal activity recognition, evaluation |
| **Sangsaptak** | Frontend, UI/UX, monitoring dashboard |
| **Suman** | Testing, deployment, recording/streaming, documentation, demo support |

Responsibilities overlap by design — every member is expected to understand the whole system well enough to review outside their primary area.

## Contributing

This is a closed team project for SIH 2026, but the workflow below applies to all contributors (human or AI agent):

1. Read [`MEMORY.md`](./MEMORY.md) and [`SIH_CONTEXT_KriyaSense.md`](./SIH_CONTEXT_KriyaSense.md) before making changes.
2. Branch from `main` — **never push directly to `main`.**
3. Keep changes incremental and test after every meaningful change.
4. Open a Pull Request; at least one review is required before merge.
5. Write meaningful commit messages (what changed and why).
6. Never commit `.env`, API keys, credentials, private datasets, or secrets.

Full rules for both human contributors and AI coding agents (Claude, Google Antigravity) are in [`RULES.md`](./RULES.md), including the absolute prohibitions on fabricated data/metrics and inventing experiment protocol steps.

## Security & Data

- No secrets, keys, or credentials are ever committed — see `.gitignore` and `.env.example`.
- The dataset is custom and experiment-specific; participant-separated train/val/test splits are mandatory (never split near-identical frames from the same video across sets).
- Data/licensing decisions and consent are human-owned; AI agents assist with pipeline and tooling only.

## References

- Problem Statement 174, Smart India Hackathon 2026 portal — [sih.gov.in](https://sih.gov.in)
- Ultralytics YOLO — [docs.ultralytics.com](https://docs.ultralytics.com)
- Google MediaPipe Pose Landmarker — [developers.google.com/mediapipe](https://developers.google.com/mediapipe)
- ByteTrack / BoT-SORT — open-source multi-object tracking research repositories
- FastAPI, React, PyTorch, OpenCV — official project documentation
- ISRO — Bharatiya Antariksh Station (BAS) programme overview — [isro.gov.in](https://isro.gov.in)

## License

License to be finalized by the team before public release. Until then, all rights reserved by Team Astrocrew.

---

<div align="center">

**KriyaSense** — a practical onboard AI experiment assistant that understands what the operator is doing, knows what should happen next, detects protocol violations, assists the operator, and produces a lightweight operational record — locally and in real time.

</div>
