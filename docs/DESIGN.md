# KriyaSense — Design System & UI/UX Specification

**Owner:** Sangsaptak (frontend/UI-UX), reviewed by Arup
**Applies to:** the live mission-monitoring dashboard (`frontend/`)
**Grounding:** this is not a generic admin dashboard — it is an **onboard payload telemetry console**. Every design decision below is derived from that subject, not from generic SaaS-dashboard defaults.

---

## 1. Design Brief (stated explicitly)

- **Subject:** a real-time console an operator glances at *while their hands are busy with a physical experiment* — not a screen they sit and study.
- **Audience:** the operator themself (low-attention, needs instant status recognition) and, secondarily, SIH judges (need to *see* rigor and real-time correctness at a glance).
- **The page's single job:** answer, in under one second of glance-time, "am I on track, and if not, what do I do next?"
- **Aesthetic direction:** technical telemetry / avionics-console, not cream-and-serif "editorial AI product," not generic near-black-with-neon-accent SaaS, not a newspaper broadsheet grid. Think of the readouts on a payload operations panel: purposeful, high-legibility, color used *only* to encode state.

---

## 2. Design Tokens

### 2.1 Color — every color is a status signal first, a decoration never

| Token | Hex | Role |
|-------|-----|------|
| `--bg-deep` | `#0B0F14` | Base console background (near-black, blue-graphite, not pure black — avoids the "AI dark mode" cliché of true black) |
| `--bg-panel` | `#121821` | Panel/card surface, one step lighter than base |
| `--line-hairline` | `#1F2A36` | Panel borders, dividers — structural, not decorative |
| `--text-primary` | `#E8EDF2` | Primary readout text |
| `--text-muted` | `#7C8B9B` | Secondary labels, timestamps |
| `--status-nominal` | `#3DDC97` | Correct step / SUCCESS (a phosphor-green, not a generic Bootstrap green) |
| `--status-caution` | `#F2B84B` | Uncertain / observing (amber, matches real telemetry "caution" amber) |
| `--status-warning` | `#FF6B4A` | Skipped / wrong-order / wrong-object alert (a warm signal-flare orange-red, deliberately *not* pure red — pure red reads as "system failure," this is "operator correction needed") |
| `--status-critical` | `#E23B3B` | Reserved strictly for invalid-action / hard-stop states |
| `--accent-signal` | `#4FB7FF` | The one cool accent — active/selected state, the "next expected step" highlight, live-data pulse |

Rule: **no gradient backgrounds, no glassmorphism, no drop shadows for decoration.** Depth is communicated by the hairline borders and one flat elevation step (`bg-deep` → `bg-panel`) only, matching real instrument-panel flatness.

### 2.2 Typography

| Role | Typeface | Notes |
|------|----------|-------|
| **Display / section headers** | *Space Grotesk* (or *IBM Plex Sans Condensed* as fallback) | Geometric, slightly technical, used only for panel titles — set in uppercase with wide letter-spacing (0.08em) to read as console labeling, not marketing headline |
| **Body / labels** | *Inter* | Neutral, extremely legible at small sizes — this console will be read at a glance, not studied |
| **Data / telemetry (the workhorse face)** | *JetBrains Mono* or *IBM Plex Mono* | Every number, timestamp, confidence score, step ID, and log line is monospaced — this is the single most important typographic decision: it makes the console feel instrumented rather than "designed," and it lets numbers align in columns the eye can scan fast |

Type scale (rem, base 16px): `0.75 / 0.875 / 1 / 1.25 / 1.75 / 2.5`. Panel titles use the smallest sizes at high letter-spacing; the *current step* and *confidence* readouts are the only elements allowed to use the largest size — everything else stays quiet so those two numbers win the glance.

### 2.3 Layout Concept

```
┌─────────────────────────────────────────────────────────────────┐
│ KriyaSense · EXPERIMENT ID: BAS-EXP-01     ● LIVE   ⏺ REC   ▲ STREAM│  ← status strip
├───────────────────────────────┬───────────────────────────────────┤
│                                │  CURRENT STEP                     │
│                                │  S3 · PLACE SAMPLE IN CONTAINER    │
│      LIVE / ANNOTATED FEED     │  CONFIDENCE ████████░░ 82%        │
│      (largest region,          ├───────────────────────────────────┤
│       operator's glance         │  EXPECTED NEXT                    │
│       anchor)                  │  S4 · SEAL CONTAINER               │
│                                │───────────────────────────────────┤
│                                │  SEQUENCE RAIL   (signature element,│
│                                │  see §3)                           │
├───────────────────────────────┴───────────────────────────────────┤
│  ALERT / EVENT TIMELINE (scrolling, timestamped, monospaced)      │
├─────────────────────────────────────────────────────────────────┤
│  [ START ]   [ STOP ]   [ RESET ]           [ DOWNLOAD LOG ▾ ]    │
└─────────────────────────────────────────────────────────────────┘
```

- **Left column (≈60% width):** the video feed — largest single element, because in an operational console the camera view *is* the ground truth the operator trusts most.
- **Right column (≈40% width):** current step, confidence, expected next step, and the sequence rail — the "cognitive summary" of the video.
- **Bottom strip:** the event timeline — append-only, newest at top, monospaced, timestamped — reads like a real telemetry log, not a chat feed.
- **Footer:** the only rounded, tactile-feeling controls on the page (START/STOP/RESET) — everything else is flat/rectangular to keep those three buttons feeling like the one place you physically interact.

### 2.4 Signature Element — the Sequence Rail

This is the one thing this dashboard is remembered by. A **horizontal (or vertical, on narrow viewports) rail of step nodes**, one per official protocol step (`S1...SN`, pulled live from `configs/experiment.yaml`):

```
[S1]━━[S2]━━[S3]━━[S4]━━[S5]
 ●     ●     ◉     ○     ○
done  done  now  next  pending
```

- Completed steps: filled `--status-nominal` node, connecting line solid.
- Current step: pulsing `--accent-signal` ring (the *only* motion permitted to loop continuously — everything else animates once, on state change, never ambiently).
- Skipped/error step: node turns `--status-warning`, connecting line becomes a dashed break instead of solid — you can *see* the gap in the sequence, which is literally the product's core insight made visual.
- Recovered step: brief flash to `--status-nominal` with a small "R" badge, then settles — the rail keeps a permanent visual scar (a small recovery mark) so judges/operators can see *that* a recovery happened even after it's resolved.

This rail is deliberately styled like a **strip-chart / punch sequence** rather than a generic numbered stepper — it encodes real telemetry information (gaps = real errors, not just "step 3 of 5") which is why a sequence-of-nodes device is justified here (see brief-grounding rule: numbered markers only when the content is genuinely sequential — here it is the literal experiment protocol).

### 2.5 Motion

- **One continuous animation only:** the pulsing ring on the current-step node.
- All other state changes animate **once**: a step completing gets a brief (150–200ms) fill transition; an alert firing gets a single soft flash on the timeline entry as it appears, then stays static.
- No parallax, no hover-bounce, no confetti. Respect `prefers-reduced-motion` — when set, the pulse becomes a static solid ring.

### 2.6 States (must all be explicitly designed, not implied)

| State | Visual treatment |
|-------|-------------------|
| **IDLE** (before START) | Feed shown but dimmed 40%, sequence rail all-pending (hollow nodes), controls show only `[ START ]` enabled |
| **IN_PROGRESS** | Full-brightness feed, live rail, live confidence bar |
| **UNCERTAIN** ("Action uncertain — observing") | Confidence bar rendered in `--status-caution`, current-step label appends "— confirming" in muted text; **this is not an error state and must never use warning/critical colors** |
| **SKIPPED / OUT_OF_ORDER / WRONG_OBJECT** | Timeline entry + rail node in `--status-warning`; a single non-looping flash draws the eye; voice + GUI text always match exactly |
| **RECOVERED** | Brief nominal flash + permanent small scar mark on the rail node |
| **SUCCESS** | Full rail solid nominal, header status strip switches its `● LIVE` dot to a static `✔ COMPLETE`, timeline gets a final summary entry |
| **STOPPED/RESET** | Returns to IDLE; a confirmation micro-dialog (not a browser `confirm()`) appears before RESET clears an in-progress run |

### 2.7 Accessibility & Responsiveness Floor

- Minimum contrast ratio 4.5:1 for all text against its background at the token values above (verify in implementation).
- All interactive controls keyboard-reachable with a visible focus ring using `--accent-signal`.
- Responsive breakpoints: the two-column layout collapses to a stacked layout (video on top, summary panel below, sequence rail becomes horizontally scrollable) below ~768px — the dashboard should still be legible on a tablet used as a secondary demo screen.
- Color is never the *only* signal: every status also carries a text label and/or icon (e.g. `●` `◉` `○` shapes above, not color alone) for color-vision accessibility.

---

## 3. Content / Copy Voice

- Written from the operator's side of the screen: "Seal the container" not "Container sealing action required."
- Errors state fact + fix, never apologize: `"S3 skipped. Return to: place sample in container."` — not "Oops, something went wrong."
- Empty/idle state is an invitation to act: `"Ready. Press START to begin BAS-EXP-01."`
- Every button label is a verb naming exactly what happens: `START`, `STOP`, `RESET`, `DOWNLOAD LOG` — never vague labels like "Submit" or "Go."

---

## 4. What This Design Deliberately Avoids

- ❌ Cream background + serif display + terracotta accent (generic "AI product" template)
- ❌ Pure near-black + single neon accent with glow/blur effects (generic "AI dashboard" template)
- ❌ Numbered-marker decoration where the numbers don't mean anything (here, they mean the literal protocol step — that's why the rail is allowed to look like a stepper)
- ❌ Decorative shadows, glassmorphism, gradients — this is an instrument panel, not a marketing page
- ❌ Ambient looping animation anywhere except the single current-step pulse

## 5. Handoff Notes for Implementation (Phase 10)

- Build the Sequence Rail component first — it is the hardest and most distinctive piece, and every other panel's state should visually agree with it.
- Confidence bar should render as a segmented/quantized bar (like a signal-strength meter), not a smooth gradient progress bar — reinforces the instrumentation feel.
- Keep the video feed panel's aspect ratio locked and letterboxed rather than stretched, regardless of viewport size.
- All copy strings should be pulled from `configs/experiment.yaml` / `EXPERIMENT_PROTOCOL.md` voice-message fields where applicable — the GUI must never hardcode step names that duplicate the source of truth.
