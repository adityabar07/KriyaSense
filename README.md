# KRIYA-SENSE

**AI Human Activity Recognition & Experiment Validation System**
SIH 2026 · Problem Statement 26174 · ISRO — *AI Human Activity Recognition for On-board BAS Experiments*

---

## 1. Project Structure

```
KRIYA-SENSE/
├── frontend/                  Static web dashboard (HTML/CSS/vanilla JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js             navigation, state, wiring, clock, polling
│   │   ├── camera.js          webcam + video-upload handling only
│   │   ├── experiment.js      FSM simulation, event log, TTS, builder logic
│   │   ├── visualization.js   canvas overlay, charts, pipeline/arch diagrams
│   │   └── api.js             mock backend abstraction (REST/WS surface)
│   └── assets/
│
├── backend/                   Future Python service (placeholder today)
│   ├── main.py                minimal FastAPI app, mock endpoints, WS stub
│   ├── requirements.txt
│   ├── api/                   (empty — future route modules)
│   ├── ai/
│   │   ├── yolo/               person/object detection
│   │   ├── pose/                MediaPipe / YOLO-Pose estimation
│   │   ├── tracking/            multi-object tracking
│   │   ├── hand_interaction/    hand-object interaction classification
│   │   ├── har/                 activity recognition model
│   │   └── temporal_model/      LSTM / GRU / Transformer
│   ├── experiment/             fsm.py, validator.py (empty — to be built)
│   ├── video/                  camera.py, recorder.py, streamer.py
│   ├── audio/                  tts.py
│   ├── logging/                experiment_logger.py
│   ├── models/                 trained weights
│   ├── datasets/
│   └── config/
│
├── data/
├── models/
├── experiments/
├── recordings/
├── logs/
└── README.md
```

**Run the frontend today:** open `frontend/index.html` directly in a browser, or serve it with any static file server. It requires no backend, no build step, and no npm install.

**Run the backend (serves the API *and* the dashboard together):**
```
cd backend
pip install -r requirements.txt
uvicorn main:app --reload   # host/port/reload come from backend/.env
```
Open **http://localhost:8000** — the dashboard and the mock API share one origin, so there's no CORS friction during the demo.

Configuration lives in `backend/.env` (git-ignored; `backend/.env.example` documents the same keys for anyone cloning fresh — copy it with `cp .env.example .env` if `.env` is missing):

| Key | Default | Meaning |
|---|---|---|
| `API_TITLE`, `API_VERSION` | `KRIYA-SENSE Backend`, `0.1.0-placeholder` | Shown in `/docs` (OpenAPI) |
| `HOST`, `PORT` | `0.0.0.0`, `8000` | Used when running `python main.py` directly; the `uvicorn` CLI's own `--host`/`--port` flags take precedence over these if passed |
| `RELOAD` | `true` | Auto-reload on file changes (only applies to `python main.py`) |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins — tighten once the frontend has a fixed deployed origin |
| `SERVE_FRONTEND` | `true` | Set to `false` to run the API only, e.g. if the frontend is hosted elsewhere |

---

## 2. How the Frontend Works

The frontend is a single-page app with ten sections toggled by `app.js` (Dashboard, Live Analysis, General Activity, Experiment Mode, Experiment Builder, Activity History, AI Pipeline, System Monitor, Video Streaming, Settings). Each JS module owns one concern only:

- **`api.js`** — the only file that knows about HTTP/WebSocket. Every other module calls functions like `getCurrentActivity()` or `connectWebSocket()` and receives a Promise/callback with JSON, never caring whether the data came from a mock generator or a real server.
- **`camera.js`** — raw video I/O: `getUserMedia()` for the live camera, `URL.createObjectURL()` for uploaded files. No AI, no canvas drawing.
- **`experiment.js`** — the client-side FSM simulation: sequence state, step validation, violation detection, event log, `speechSynthesis` voice alerts, TXT export, and the experiment builder's save logic.
- **`visualization.js`** — everything visual: the canvas overlay (bounding boxes, pose skeleton, hand keypoints), the AI pipeline diagram, the frontend↔backend architecture diagram, and the Chart.js instances.
- **`app.js`** — the only file that touches the DOM structure directly. It wires the above modules to the page and runs the polling/animation loops (clock, system metrics, `requestAnimationFrame` vision loop).

## 3. How the Backend Will Work

`backend/main.py` is a minimal FastAPI app exposing the exact REST/WebSocket contract the frontend already expects, returning mock JSON. As each AI stage is implemented under `backend/ai/`, `backend/experiment/`, `backend/video/`, and `backend/audio/`, the corresponding endpoint body is swapped from "return mock data" to "call the real pipeline stage" — no frontend changes required, because the JSON shape stays identical.

The intended real-time flow inside the backend:

```
Camera → OpenCV → YOLO → Tracking → Pose Estimation → Hand Detection
  → Hand-Object Interaction → Feature Extraction → HAR Model
  → LSTM/GRU/Transformer → Activity Prediction → Finite State Machine
  → Sequence Validation → Guidance/TTS/Logging → API/WebSocket → Frontend
```

## 4. How Frontend ↔ Backend Communication Works

`api.js` defines the full client surface the backend must satisfy:

| Function | REST equivalent |
|---|---|
| `getCurrentActivity()` | `GET /api/activity` |
| `getDetections()` | `GET /api/detections` |
| `getPose()` | `GET /api/pose` |
| `getTracking()` | `GET /api/tracking` |
| `getExperimentStatus()` | `GET /api/experiment` |
| `getSystemMetrics()` | `GET /api/system` |
| `getEventLog()` | `GET /api/events` |
| `startAnalysis()` / `stopAnalysis()` | `POST /api/analysis/start` / `/stop` |
| `createExperiment()` | `POST /api/experiment/create` |
| `resetExperiment()` | `POST /api/experiment/reset` |
| `connectWebSocket()` | `WS /ws/ai-stream` |

The **Settings** page lets you point the frontend at a real backend URL and click "Attempt Backend Connection." If the backend responds, the status pill switches from `BACKEND: MOCK MODE` to `BACKEND: LIVE`. If it's unreachable (or simply off), the UI silently continues on local mock data — nothing in the interface ever blocks or errors out waiting for a server.

## 5. What Is Currently Simulated

Everything AI-related. `api.js` generates randomized-but-plausible JSON matching the target contract (`person_count`, `activity`, `confidence`, `objects[]`, `pose`, `hands`); `experiment.js` runs the FSM logic that will eventually live in `backend/experiment/fsm.py`; `visualization.js` draws bounding boxes/skeletons procedurally rather than from real model output. Camera capture and video upload/playback are the only genuinely real (non-simulated) pieces — they use real browser APIs, but no video frame ever leaves the device.

## 6–13. Where Each Real AI Component Will Be Integrated

| Component | Backend location | Wired to frontend via |
|---|---|---|
| **YOLO** (detection) | `backend/ai/yolo/` | `GET /api/detections`, streamed over `/ws/ai-stream` |
| **Pose estimation** (MediaPipe/YOLO-Pose) | `backend/ai/pose/` | `GET /api/pose` |
| **Tracking** | `backend/ai/tracking/` | `GET /api/tracking` |
| **HAR model** | `backend/ai/har/` | `GET /api/activity` (`activity`, `confidence`) |
| **LSTM/GRU/Transformer** (temporal) | `backend/ai/temporal_model/` | feeds HAR output before `/api/activity` responds |
| **Finite State Machine** | `backend/experiment/fsm.py` + `validator.py` | `GET /api/experiment`, `POST /api/experiment/*` |
| **TTS** | `backend/audio/tts.py` | triggered server-side on violation/guidance events; frontend's `speechSynthesis` calls in `experiment.js` are today's stand-in and can stay as a fallback even after the backend gets real TTS |
| **OpenCV** | used throughout `backend/video/camera.py` and every `ai/*` stage for frame pre/post-processing | reflected in the System Monitor's OpenCV panel (`GET /api/system`) |
| **FFmpeg/GStreamer** | `backend/video/recorder.py`, `backend/video/streamer.py` | reflected in the Video Streaming page (`GET /api/system`, future `/api/stream/status`) |

## 14. Where FFmpeg/GStreamer Fit

`backend/video/recorder.py` will pipe processed frames to FFmpeg for local `.mp4` recording into `recordings/`; `backend/video/streamer.py` will use FFmpeg/GStreamer to publish an RTSP/IP stream for ground monitoring. Both are currently represented in the frontend's Video Streaming page as read-only telemetry (recording status, encoding, destination, protocol) sourced from mock data.

## 15. How to Eventually Connect Everything

1. Implement each `backend/ai/*` module independently against recorded sample video, validating output shape against the JSON contract already consumed by `api.js`.
2. Wire them into `backend/main.py` in pipeline order (YOLO → Pose → Tracking → Hand Interaction → HAR → Temporal Model), replacing the mock frame generator.
3. Implement `backend/experiment/fsm.py` and `validator.py` using the same state machine shape `experiment.js` already models client-side, so the Experiment Mode UI needs no changes.
4. Replace the `setInterval` mock in `ASTRA_API.connectWebSocket()` (`frontend/js/api.js`) with a real `new WebSocket(CONFIG.wsUrl)` connection — this is the only edit required in the frontend to go fully live.
5. Point the Settings page's API Base / WebSocket fields at the deployed backend and confirm `BACKEND: LIVE` status.
6. Turn on `backend/video/recorder.py` and `streamer.py` for persistent recording and ground-station streaming once camera + inference are stable end to end.
