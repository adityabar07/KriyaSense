# KRIYA-SENSE — AI Model & Dataset Plan

This document is the reference for whoever implements the real models behind
`backend/ai/*`. Nothing in this folder runs real inference yet (see each
module's docstring) — this is the plan those stubs are built against.

## 1. Pipeline shape

```
CAMERA → OpenCV → YOLO → TRACKING → HAND DETECTION → HAND-OBJECT INTERACTION
       → FEATURE EXTRACTION → HAR MODEL → LSTM/GRU/TRANSFORMER
       → ACTIVITY PREDICTION → FSM → SEQUENCE VALIDATION → GUIDANCE/TTS/LOGGING
```

Each arrow is one `backend/ai/*` module (plus `backend/experiment/fsm.py`,
`backend/audio/tts.py`, `backend/logging/experiment_logger.py` downstream).
Every module's input/output contract already matches what the frontend
consumes — see `backend/ai/yolo/detector.py`'s `BBox`/`Detection` dataclasses
and `frontend/js/detection.js`'s normalized-bbox JSON shape side by side.

## 2. Reference scenario

The prototype targets a representative BAS chemical-handling experiment
(the problem statement doesn't mandate one specific experiment, so this is a
stand-in you can swap for the real one without changing the pipeline):

```
pick_up → open_cap → draw_liquid → pour_liquid → mix → place_back
```

This is already wired into `frontend/js/experiment.js`'s default sequence
and `frontend/js/detection.js`'s mock scene script, so the whole frontend
demo is built around this exact scenario.

## 3. Dataset categories

### A. Object detection

| Class | Notes |
|---|---|
| `person` | the astronaut |
| `hand` | for hand-detection-assisted interaction, if not derived from pose |
| `chemical_bottle` | the item picked up / capped |
| `test_tube` (+ `test_tube_rack`) | pour target |
| `syringe` / `pipette` | draws liquid |
| `beaker` | optional mixing container |
| `petri_dish` | biological-experiment variant |
| `payload_rack` | orientation reference backdrop (see §5) |

Target **100–150 images per object class**, varied across angle, distance,
orientation, and lighting.

### B. Activity / sequence dataset

Record **20–30 clips per action, ~10–15s each**, for the six BAS actions
above, plus general activities the model should still recognize outside the
experiment context: `standing`, `sitting`, `walking`, `running`,
`lying_down`, `reading`, `writing`, `using_laptop`, `using_phone`,
`carrying`, `reaching`.

### C. Negative / error dataset

Required so the FSM's violation detection has real signal to learn from,
not just rule-based mismatch:

- **Skipped step** — e.g. `pour_liquid` performed without `open_cap` first.
- **Wrong sequence** — e.g. `mix` before `draw_liquid`.
- **Wrong object interaction** — correct action, wrong target object.

Label these `skip_step`, `wrong_sequence`, `wrong_object`,
`premature_action` (see `ACTIVITY_CLASSES` in `ai/har/har_model.py`).

### D. Orientation / pose dataset

Space has no fixed floor. Record the same actions with:

- Camera mounted on wall / ceiling / at an angle.
- Astronaut standing, sitting, leaning, bending, rotated, sideways.

The model should reason about the astronaut **relative to the payload
rack**, not relative to an assumed floor — see `ORIENTATION-AGNOSTIC
MODULE` in the frontend (`3D Human Mesh Recovery`, optional stretch goal
via ROMP / Mesh Graphormer).

## 4. Dataset sourcing (before your own recordings exist)

| Need | Source | Search terms |
|---|---|---|
| Hand detection / interaction | Kaggle, Roboflow Universe | `EgoHands`, `Hand Object Interaction`, `YOLO Hand Detection` |
| General activity recognition | Kaggle | `UCF101`, `Human Activity Recognition` |
| Lab equipment | Roboflow Universe | `Lab Equipment`, `Test Tube Detection`, `Beaker Detection`, `Pipette Tracking` |
| Space/ISS visual reference | NASA Open Data Portal | `Astronaut Activity`, `ISS Experiments`, `Microgravity Experiment` |

None of these will match the BAS experiment exactly — they're for transfer
learning, not the final dataset.

## 5. Strategy: transfer learning → fine-tuning → edge deployment

```
Public dataset(s)  →  pre-train / transfer learning
                            ↓
Your own recordings (500–1000 images + clips, including negatives
and orientation variation)
                            ↓
Fine-tune on the combined set
                            ↓
Export (ONNX / TensorRT) for edge inference
                            ↓
Offline deployment — no internet required at inference time
```

Collection doesn't need a lab: a phone on a fixed stand, positioned like a
payload camera, recording one continuous run of the experiment, then split
into per-action clips (`pick_up_01.mp4`, `open_cap_01.mp4`, …) is enough for
a first training pass. Annotate with Roboflow or CVAT; export in YOLO
format (`images/{train,val,test}` + `labels/{train,val,test}` + `data.yaml`).

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")                     # pick the model your Ultralytics version supports
model.train(data="data.yaml", epochs=50, imgsz=640, batch=16, device="0")  # device="cpu" if no GPU
model.export(format="onnx")                     # edge-deployable
```

Internet is only needed while downloading/training — the exported model
runs fully offline on the edge device (see `SYSTEM_MONITOR`'s "EDGE AI" /
"OFFLINE CAPABLE" framing in the frontend, which this maps directly onto).

## 6. Where each dataset category feeds into `backend/ai/`

| Dataset | Module |
|---|---|
| Object detection | `ai/yolo/detector.py` |
| Hand/pose | `ai/pose/pose_estimator.py`, `ai/hand_interaction/hand_object.py` |
| Activity + negative classes | `ai/har/har_model.py` (`ACTIVITY_CLASSES`) |
| Sequences (temporal) | `ai/temporal_model/sequence_model.py` |
| Cross-frame identity | `ai/tracking/tracker.py` — **already a real (non-ML) implementation**, see its docstring |

## 7. Non-goals for this repo

Training scripts, notebooks, and actual dataset files don't belong in this
repo — `backend/datasets/` and `models/` (gitignored, see root
`.gitignore`) are where they'd live locally or via DVC/LFS in a real setup.
This file is the plan; the `ai/*.py` stubs are the contract that plan has to
satisfy.
