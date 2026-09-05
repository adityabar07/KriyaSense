# API Specification

STATUS: Draft — document the existing endpoints in backend/api/routes.py as they exist today (mock contract), marked clearly as subject to change once real inference lands.

---

## Overview

The KRIYA-SENSE backend exposes REST and WebSocket endpoints for dashboard communication, inference control, and system metrics.

### Base URL
- Local: `http://localhost:8000`

---

## Endpoints

### 1. Health & Status

#### `GET /health`
- **Description:** Basic service health check (used by deployments and load balancers).
- **Response:**
  ```json
  {
    "status": "healthy"
  }
  ```

#### `GET /api/status`
- **Description:** System status and active analysis mode.
- **Response:**
  ```json
  {
    "status": "ok",
    "mode": "BACKEND_PLACEHOLDER",
    "analysis_running": true
  }
  ```

---

### 2. Live Perception & State

#### `GET /api/activity`
- **Description:** Current detected activity, confidence score, and person count.
- **Response:**
  ```json
  {
    "activity": "DRAW_LIQUID",
    "confidence": 0.85,
    "person_count": 1
  }
  ```

#### `GET /api/detections`
- **Description:** Bounding box detections and classifications for the current frame.
- **Response:** Array of detected objects with bounding coordinates, class name, and confidence.

#### `GET /api/pose`
- **Description:** Keypoint landmarks for detected persons in the frame.
- **Response:** Object containing normalized pose landmark coordinates.

#### `GET /api/tracking`
- **Description:** Active tracked entities with stable track IDs.
- **Response:**
  ```json
  [
    { "id": "PERSON #01", "type": "person", "confidence": 0.92 },
    { "id": "OBJECT #01", "type": "pipette", "confidence": 0.88 }
  ]
  ```

---

### 3. Experiment Lifecycle & Validation

#### `GET /api/experiment`
- **Description:** Current experiment state machine status, step sequence, expected step, and validation outcome.
- **Response:**
  ```json
  {
    "name": "BAS Sample Handling Protocol",
    "sequence": ["PICK_UP", "OPEN_CAP", "DRAW_LIQUID", "POUR_LIQUID", "MIX", "PLACE_BACK"],
    "total_steps": 6,
    "current_step": 3,
    "expected": "DRAW_LIQUID",
    "detected": "DRAW_LIQUID",
    "status": "VALID"
  }
  ```

#### `POST /api/experiment/create`
- **Description:** Initialize a new experiment protocol sequence.
- **Request Body:**
  ```json
  {
    "name": "Custom Protocol",
    "steps": ["STEP_1", "STEP_2", "STEP_3"]
  }
  ```

#### `POST /api/experiment/reset`
- **Description:** Reset experiment progress to step 1.

---

### 4. Analysis Control & Events

#### `POST /api/analysis/start`
- **Description:** Resume or start real-time analysis loop.

#### `POST /api/analysis/stop`
- **Description:** Pause real-time analysis loop.

#### `GET /api/events`
- **Description:** Structured event log history.

#### `GET /api/system`
- **Description:** Resource metrics (FPS, inference latency, CPU/GPU/memory utilization).

---

### 5. WebSocket Stream

#### `WS /ws/ai-stream`
- **Description:** Real-time push stream delivering frame-by-frame perception and state updates whenever analysis is active.
