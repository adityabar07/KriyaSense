# KriyaSense — Product Requirements Document (PRD)

**Team:** Astrocrew
**SIH Problem Statement:** PS 174 / SIH26174
**Document Owner:** Arup (Co-Leader, AI/ML Architecture)
**Status:** DRAFT — Phase 0 (Understand & Freeze)
**Source of Truth Reference:** `MEMORY.md`, `SIH_CONTEXT_ASTRA_H.md`

---

## 1. Purpose of This Document

This PRD defines *what* KriyaSense must do and *why*, independent of implementation detail (covered in `ARCHITECTURE.md`). It is the contract between the team, the AI coding agents (Claude, Antigravity), and the SIH judging criteria. Any change to scope must be reflected here before it is reflected in code.

---

## 2. Problem Statement

Onboard experiments (e.g. on a space payload / BAS — Bharatiya Antariksh Station-class — platform) are executed by an operator following a fixed procedural sequence. Today:

- There is no automated, real-time way to verify the operator followed the **correct sequence of steps**.
- Errors (skipped steps, wrong order, wrong object, invalid actions) are typically caught only in post-mission review, if at all — wasting scarce onboard time and risking invalid experiment results.
- Continuous raw video downlink for ground review is bandwidth-expensive; a compact, structured event log is far more valuable operationally.
- Existing Human Activity Recognition (HAR) systems recognize generic activities (walking, sitting, reaching) — they are **not** procedure-aware and cannot validate an experiment protocol.

## 3. Product Vision

> **KriyaSense is an onboard experiment intelligence and protocol-validation system — not a generic HAR classifier.**

It watches a fixed-payload camera feed of an operator performing a predefined BAS experiment, understands *what step is being performed*, checks that step against the *officially expected sequence*, and in real time:

- Confirms correct progress,
- Warns on skipped / out-of-order / wrong-object / invalid actions,
- Suggests the next valid step,
- Produces a lightweight, timestamped operational record,
- Runs entirely offline, on local compute.

**Core loop:** `Observe → Understand → Validate → Warn → Record`

## 4. Goals

| # | Goal | Why it matters |
|---|------|-----------------|
| G1 | Real-time recognition of the operator's current experiment step | Foundation for all validation |
| G2 | Deterministic validation of observed vs. expected sequence | Explainability + reliability for judges and real operational trust |
| G3 | Immediate, understandable warnings (voice + GUI) | Lets the operator self-correct without ground intervention |
| G4 | Fully offline operation | Matches onboard / space-constrained connectivity reality |
| G5 | Lightweight structured logs (TXT/CSV/JSON) instead of raw video downlink | Bandwidth-realistic, mission-relevant record |
| G6 | Mission-control-grade monitoring dashboard | Operational credibility + strong SIH demo impact |
| G7 | Reproducible, honest evaluation (no fabricated metrics) | Scientific credibility, SIH judging integrity |

## 5. Non-Goals (Explicitly Out of Scope for the SIH Prototype)

- Generic, experiment-agnostic HAR (any activity, any environment).
- Full 3D biomechanical analysis (only optional advanced extension, Phase 14).
- Multi-experiment support in v1 — the system is built and trained around **one official PS 174 experiment protocol** first.
- Cloud-dependent inference of any kind in the final core system.
- Autonomous corrective action (the system *warns*, it never *acts* on the operator's behalf).
- Full space-hardware qualification — this is a terrestrial prototype demonstrating the concept.

## 6. Target Users / Stakeholders

| User | Need |
|------|------|
| **Onboard operator** (experiment executor) | Real-time guidance, immediate error feedback, minimal cognitive load |
| **Ground/mission control (simulated for SIH)** | Confidence that the experiment was executed correctly, without needing raw video |
| **SIH Judges** | Evidence of technical depth, explainability, offline capability, real dataset/evaluation rigor |
| **Development team (Astrocrew)** | Clear, non-ambiguous requirements and phase gates |

## 7. Critical Dependency: Official Experiment Protocol

**Blocking requirement before any dataset/model work begins:** the complete, verified official step sequence, objects, and pass/fail conditions for PS 174 must be sourced from the authoritative SIH problem statement and documented in `docs/EXPERIMENT_PROTOCOL.md`.

No step, object class, or condition may be invented by any AI agent. Until this is frozen, all steps in this PRD, `PHASES.md`, and `ARCHITECTURE.md` referring to "S1...SN" are **placeholders**.

## 8. Functional Requirements

### FR-1 — Perception
- FR-1.1 Detect the operator and all official experiment objects/tools/target areas in each frame.
- FR-1.2 Track objects and the operator with stable IDs across frames.
- FR-1.3 Estimate operator pose (minimum: shoulders, elbows, wrists, hips, head), with emphasis on wrist trajectories.
- FR-1.4 Infer hand-object interaction events: PICK, MOVE, PLACE, OPEN, CLOSE (as applicable to the official protocol).

### FR-2 — Activity / Step Recognition
- FR-2.1 Classify the current experiment step from temporal features (rule-based baseline first).
- FR-2.2 Escalate to LSTM/GRU (and Transformer only if justified by data/performance) as the dataset matures.
- FR-2.3 Never trigger a step transition from a single uncertain frame — require temporal smoothing / minimum-duration confirmation.

### FR-3 — Sequence Validation (Deterministic State Machine)
- FR-3.1 Maintain expected-step state per the frozen protocol config (`configs/experiment.yaml`).
- FR-3.2 Compare observed step to expected step every cycle.
- FR-3.3 Detect and classify errors: skipped step, out-of-order step, wrong object, repeated step, invalid action.
- FR-3.4 Support recovery: if the operator completes the missing/corrected step, resume normal flow and log `RECOVERED`.

### FR-4 — Feedback
- FR-4.1 Offline text-to-speech alerts for: step completed + next step, skipped-step warning, out-of-order warning, wrong-object warning.
- FR-4.2 GUI must reflect the same state as voice output at all times (no divergence).
- FR-4.3 Low-confidence state must render as **"Action uncertain — observing"**, never as a false error.

### FR-5 — Logging & Recording
- FR-5.1 Generate timestamped event logs in TXT, CSV, and JSON containing: experiment ID, timestamp, step, confidence, status, error/recovery events.
- FR-5.2 Store raw camera feed locally; optionally store annotated feed.
- FR-5.3 Support local IP streaming (RTSP/RTP/MJPEG or environment-appropriate equivalent), decoupled from the inference pipeline.

### FR-6 — GUI / Dashboard
- FR-6.1 Live/annotated video feed.
- FR-6.2 Current step, expected next step, detected action, confidence.
- FR-6.3 Expected sequence vs. observed sequence, side by side.
- FR-6.4 Alert/event timeline.
- FR-6.5 START / STOP / RESET controls.
- FR-6.6 Log download.
- FR-6.7 Recording/streaming status indicators.

(Full interaction and visual spec: see `DESIGN.md`.)

### FR-7 — Configuration
- FR-7.1 Experiment steps, objects, and conditions must be defined in `configs/experiment.yaml`, not hard-coded in Python — the engine must be protocol-agnostic at the code level even though v1 targets one protocol.

## 9. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Offline-first** | All inference, TTS, state machine, GUI, logging, and recording must run with zero internet dependency in the final build |
| **Latency** | End-to-end perception → alert latency should be evaluated and reported (target: sub-second on the development hardware; exact target set after Phase 3 baseline) |
| **Explainability** | Every alert must be traceable to a specific rule/state transition — no black-box-only decisions for validation |
| **Reliability** | False-alert rate is a first-class metric, tracked and reported alongside accuracy |
| **Portability** | Must run on a standard laptop/desktop baseline; GPU acceleration is a performance enhancement, not a hard dependency for the MVP |
| **Data integrity** | No fabricated datasets, metrics, or results at any point — every number in the SIH pitch must be reproducible |
| **Modularity** | Perception, temporal model, state machine, GUI, and I/O must remain independently testable modules |
| **Security** | No secrets, credentials, or private datasets committed to Git |

## 10. Success Metrics (Reported Honestly, Not Cherry-Picked)

- Object detection: Precision, Recall, mAP
- Activity recognition: Accuracy, Precision, Recall, F1, confusion matrix
- Sequence validation: correct-sequence accuracy, skipped-step detection rate, out-of-order detection rate, wrong-object detection rate, **false-alert rate**
- System: FPS, end-to-end latency, CPU/GPU/RAM usage
- Alerts: alert latency, correct-alert rate

## 11. Constraints & Assumptions

- Hardware baseline: laptop/desktop + 1080p USB webcam + tripod + experiment props (GPU, higher-res camera, and edge devices are preferred upgrades, not assumptions).
- Dataset must be **custom-collected** for the official protocol — no proxy/generic HAR dataset can substitute.
- Team size and skill distribution as defined in `RULES.md` §Team Responsibilities.
- Timeline constrained by SIH 2026 submission/demo dates (team to fill in exact dates once confirmed).

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Official protocol not clarified in time | Blocks all dataset/model work | Treat Phase 0 as hard gate; escalate to mentors/SIH channels early |
| Small dataset (3–5 participants) limits model generalization | Weak accuracy, high false-alert rate | Rule-based baseline first; report limitations honestly; prioritize data quality over model complexity |
| Real-time perf on modest hardware | Laggy demo | Start with lightweight YOLO variant; profile early; optimize (Phase 13) only after accuracy is stable |
| Overengineering with unnecessary tech (Transformers, microservices) | Wasted time, fragile system | Enforce Priority Order in `RULES.md`; justify every architectural addition |
| False alerts eroding operator trust | Core USP fails the demo | Confidence fusion + temporal smoothing (see `ARCHITECTURE.md` §Confidence) |

## 13. Milestone Reference

See `PHASES.md` for the full phase-by-phase plan (Phase 0 → Phase 14) with entry/exit criteria and owners.

## 14. Open Questions (must be resolved in Phase 0)

- [ ] Exact, complete official PS 174 experiment sequence and object list (source: authoritative SIH statement)
- [ ] Exact pass/fail conditions per step
- [ ] Confirmed hardware available to the team for pilot recording
- [ ] Confirmed number of participants available for dataset collection
- [ ] SIH demo day constraints (network availability, time slot, screen/projector setup)
