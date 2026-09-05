# KriyaSense — Project Memory

**Purpose:** This is the persistent, living context file for every AI agent (Claude, Google Antigravity, or any future assistant) and every human joining the team mid-project. It captures *confirmed facts*, *open assumptions*, *decisions made and why*, and a *changelog* — so no agent ever has to re-derive context or, worse, re-invent it.

> Rule for all agents: read this file before making any non-trivial decision. Update it (via a PR, reviewed by a human) whenever a real decision is made. Never silently let this file go stale.

---

## 1. Project Snapshot (always keep current)

- **Project:** KriyaSense — AI Human Activity Recognition for On-board BAS Experiments
- **Team:** Astrocrew
- **Problem Statement:** SIH PS 174 / SIH26174
- **Core loop:** Observe → Understand → Validate → Warn → Record
- **Current phase:** Phase 0 — Understand & Freeze *(update as project progresses)*
- **Current blocking item:** Official PS 174 experiment sequence not yet frozen in `docs/EXPERIMENT_PROTOCOL.md`

## 2. Confirmed Facts (do not re-litigate these)

| Fact | Status |
|------|--------|
| KriyaSense validates a *specific* BAS experiment protocol, not generic HAR | ✅ Confirmed — core product identity |
| AI (probabilistic step recognition) and the state machine (deterministic validation) must remain architecturally separate | ✅ Confirmed |
| Final system must run fully offline | ✅ Confirmed |
| Dataset must be custom-collected for this experiment, not a proxy dataset | ✅ Confirmed |
| Experiment protocol must come from the official SIH PS 174 statement only | ✅ Confirmed |
| Team has 6 members with defined primary roles (see `RULES.md` §Team Responsibilities) | ✅ Confirmed |

## 3. Unconfirmed / Assumed (must be resolved, not treated as fact)

| Item | Current assumption | Needs confirmation from |
|------|---------------------|--------------------------|
| Exact number/order of experiment steps | Placeholder S1...SN | Official SIH PS 174 statement |
| Exact objects/tools involved | Only "red and yellow smaller boxes" visually referenced so far | Official SIH PS 174 statement |
| Number of dataset participants available | 3–5 minimum, 5–10 target | Team logistics confirmation |
| Demo-day network availability | Assume none (worst case) | SIH event organizers |
| Target hardware for final demo | Laptop/desktop + webcam baseline | Team hardware inventory check |

## 4. Module Build Status

| Folder | Purpose | Status |
|---|---|---|
| state_machine/ | Deterministic expected-vs-observed validator | Not started |
| alerts/ | Offline TTS + confidence fusion | Not started |
| video/ | Local recording + IP streaming | Not started |
| logging/ | TXT/CSV/JSON event logs | Not started |
| models/ | Trained model artifacts (gitignored binaries) | Not started |
| evaluation/ | Evaluation scripts + metrics reports | Not started |
| scripts/ | One-off utility/setup scripts | Not started |
| tests/ | Unit + integration test suite | Not started |

## 5. Glossary

| Term | Meaning |
|------|---------|
| **BAS** | Bharatiya Antariksh Station — the onboard context this experiment simulates |
| **Step (S1...SN)** | An official, discrete unit of the experiment protocol, defined in `EXPERIMENT_PROTOCOL.md` |
| **Observed step** | What the AI perception+activity pipeline currently believes the operator is doing |
| **Expected step** | What the deterministic state machine, per `configs/experiment.yaml`, currently requires next |
| **Recovery** | When an operator corrects a flagged error and the state machine resumes normal validation |
| **False-alert rate** | Fraction of alerts raised that do not correspond to a real protocol violation — a first-class metric, not an afterthought |

## 6. Decision Log

Record every non-trivial decision here: what was decided, why, who, and when. Never delete entries — supersede them.

| Date | Decision | Rationale | Decided by |
|------|----------|-----------|-------------|
| *(fill in)* | Rule-based baseline before any LSTM/GRU training | Explainability + establishes a measurable floor before adding model complexity | Team |
| *(fill in)* | Participant-separated dataset split (not random frame split) | Prevents data leakage from near-identical frames of the same trial | Team |
| *(fill in)* | State machine is the sole authority for validity; ML never triggers alerts directly | Explainability and testability required for SIH judging and real operational trust | Team |
| *(add new rows below as decisions are made — do not overwrite history)* | | | |

## 7. Known Risks Being Tracked

See `PRD.md` §12 for the full risk table. Update status here as risks materialize or are mitigated:

- Official protocol clarification delay — **status: open, highest priority**
- Small dataset generalization risk — **status: monitor from Phase 6 onward**
- Real-time performance on modest hardware — **status: monitor from Phase 3 onward**

## 8. What AI Agents Must Never Do (quick-reference; full rules in `RULES.md`)

- Never invent experiment steps, objects, or pass/fail conditions.
- Never fabricate datasets, metrics, results, or citations.
- Never merge the probabilistic activity model and the deterministic validator into one opaque component.
- Never mark a phase "done" without a documented artifact (file, metric, or test result).
- Never commit secrets, credentials, or private datasets.

## 9. Changelog

| Date | Change | Author |
|------|--------|--------|
| *(fill in creation date)* | Initial MEMORY.md created alongside PRD/PHASES/ARCHITECTURE/DESIGN/RULES for Phase 0 | Arup / Claude (drafting assistant) |

---

**Reminder to future readers (human or AI):** this file is only useful if it stays current. A stale memory file is worse than no memory file, because it creates false confidence. Update §1, §3, and §5 as the project moves.
