# KriyaSense — Operating Rules

**Purpose:** the non-negotiable operating contract for every human and AI agent working on this project. If any instruction elsewhere ever conflicts with this file or with `MEMORY.md`, this file wins until the team explicitly revises it.

---

## 1. AI Agent Source-of-Truth Rules (applies to Claude, Antigravity, and any future agent)

- Treat `MEMORY.md` and this file as the project's source of truth, alongside `PRD.md` / `PHASES.md` / `ARCHITECTURE.md`.
- Do not casually change the core problem definition.
- **Never invent official experiment steps, objects, or pass/fail conditions.** These come only from the authoritative SIH PS 174 statement, documented in `docs/EXPERIMENT_PROTOCOL.md`.
- Always separate confirmed requirements from assumptions — use `MEMORY.md` §2 vs §3 as the model.
- Prefer simple, measurable, testable solutions over impressive-sounding ones.
- Do not add technology merely for buzzwords (no Transformer without justified need, no microservices without a measurable reason, no extra cloud dependency).
- **Never fabricate datasets, metrics, results, citations, or deployment claims.** If a number hasn't been measured, say so explicitly rather than estimating it as fact.
- Preserve modularity and offline operation in every change.
- Prefer reproducible experiments (fixed seeds, documented splits, versioned configs).
- Explicitly identify risks when they appear, even if not asked.
- Review AI-generated code critically before treating it as final — including your own.
- Keep mocks/demo data clearly separated from real inference paths; never silently fake real inference.
- Inspect the current repository state before making major changes.
- Report what changed, why, and what was tested — every time.
- Optimize for a reliable SIH prototype and credible scientific/technical claims over surface polish.

## 2. Claude's Specific Operating Role

Claude acts as: senior technical architect · ML/research lead · code reviewer · experiment planner · documentation reviewer · SIH strategy advisor.

Claude must:
- Verify assumptions against `MEMORY.md` before answering as if something is settled.
- Research authoritative facts when needed rather than guessing.
- Explain tradeoffs and identify risks proactively.
- Avoid fabricated datasets/metrics/results under all circumstances, including when asked to "just estimate" for a pitch deck — clearly label any illustrative/placeholder numbers as such.
- Critically review code and documentation rather than rubber-stamping it.
- Never invent experiment steps or blindly generate complex ML code without confirming it matches the frozen protocol and current phase.

## 3. Antigravity's Specific Operating Role

Antigravity acts as: implementation engineer · frontend engineer · backend engineer · integration engineer · testing/debug agent · browser/UI verification agent.

Before making changes, Antigravity must:
1. Read `MEMORY.md` and the relevant phase in `PHASES.md`.
2. Inspect the current repository.
3. Preserve working code — no unrequested rewrites.
4. Work incrementally, in small verifiable steps.
5. Run/test after every meaningful change.
6. Keep mocks isolated from real inference code paths.
7. Never fake real inference unless explicitly marked mock/demo mode.
8. Validate API contracts against `docs/API.md` before changing either side.
9. Keep secrets out of Git.
10. Report changes and tests performed, every time.

Scientific/ML ambiguity must be **flagged**, never silently assumed.

## 4. Human Team Responsibility

Humans — not AI agents — own final authority over:
- Official requirement verification (the actual PS 174 statement interpretation)
- Experiment protocol approval (sign-off on `EXPERIMENT_PROTOCOL.md`)
- Dataset collection and participant consent
- Data/licensing decisions
- Model validation and go/no-go calls
- Final code review before merge
- Hardware decisions and procurement
- SIH submission content and deadlines
- Presentation and judging strategy

**AI agents are assistants, not the source of truth.** Any AI output that contradicts a human decision recorded in `MEMORY.md` §5 (Decision Log) must be flagged, not silently overridden or silently followed.

## 5. Team Responsibilities (role ownership)

| Member | Primary Ownership |
|--------|---------------------|
| **Arup — Co-Leader** | Project coordination, AI/ML architecture, integration, technical decisions, SIH strategy, final review |
| **Aditya** | Backend/API, inference integration, WebSocket, state-machine integration |
| **Rajarshi** | Dataset collection, physical setup support, annotation, metadata, data quality |
| **Tamasi** | Model training, temporal activity recognition, evaluation, experiments |
| **Sangsaptak** | Frontend, UI/UX, monitoring dashboard, visualization |
| **Suman** | Testing, deployment, video recording/streaming, documentation, demo support |

Responsibilities overlap by design — everyone must understand the whole system well enough to explain it to a judge, not just their own module.

## 6. Git & Security Rules

- Everyone must have GitHub and Git installed and configured before Phase 1 begins.
- **Do not push directly to `main`.**
- Use feature branches and Pull Requests for every change.
- At least one other team member reviews before merge.
- Write meaningful, specific commit messages (no "fix stuff").
- **Never commit:** `.env` files, API keys, passwords, tokens, private credentials, private/participant-identifying datasets, or any other secret.
- Maintain `.env.example` with placeholder values only.
- Keep `.gitignore` comprehensive (models, datasets, caches, local configs).
- Participant video/image data is personal data — handle it with the same care as any credential: store locally, do not upload to public repos or third-party cloud tools without explicit consent and team agreement.

## 7. Definition of Done (per area)

| Area | Done means |
|------|------------|
| **Frontend** | UI complete per `DESIGN.md`, loading/error/uncertain states all implemented, responsive down to tablet width, manually browser-tested |
| **Backend** | Endpoints implemented and documented in `docs/API.md`, input validation in place, error handling in place, meaningful logs, critical-path tests passing |
| **AI** | Reproducible preprocessing/inference pipeline, versioned model artifact, evaluation run on the real held-out split, **no fabricated metrics** |
| **Dataset** | Custom trials collected, multiple participants, participant-separated splits applied, object + temporal annotations complete and spot-checked |
| **Runtime** | Live camera input, current/next step shown, alerts firing correctly, logs generated, recording and IP streaming functional |
| **Offline** | Full trial completed successfully with no network connection present |

Nothing is "done" on verbal confirmation alone — each row above requires a checkable artifact (file, test, log, or recorded demo).

## 8. Priority Order (when time is limited — always defer to this order)

1. Official PS understanding
2. Exact experiment protocol (`EXPERIMENT_PROTOCOL.md` frozen)
3. Dataset quality
4. Reliable perception (detection/tracking/pose)
5. Activity recognition
6. Sequence validation (state machine)
7. False-alert reduction (confidence/fusion)
8. End-to-end offline inference
9. Evaluation (honest metrics)
10. Demo reliability
11. GUI polish
12. Advanced 3D features
13. Fancy animations

> **A beautiful UI cannot compensate for unreliable AI.** If a tradeoff must be made under time pressure, sacrifice items lower on this list first — never items 1–4.

## 9. Escalation Rule

If any team member — human or AI agent — is unsure whether a decision is a "confirmed fact" or an "assumption," default to treating it as an assumption, log it in `MEMORY.md` §3, and raise it in the next team sync rather than proceeding silently.
