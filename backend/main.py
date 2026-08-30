"""
ASTRA-HAR Backend — FastAPI application entrypoint.

This is intentionally NOT an AI backend yet (see api/state.py for the
mock data contract that stands in for it). Its job right now is to:

  1. Expose the REST/WebSocket API the frontend already speaks (api/routes.py).
  2. Serve the frontend itself as static files, so the whole project runs
     from a single command with no separate dev server and no CORS to think
     about during the demo.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
    # or: python main.py

Then open http://localhost:8000 — the dashboard and the mock API are both
served from that one origin. The frontend still works completely on its
own (see frontend/README-less static serving via any file server) — this
backend is additive, not required.
"""

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import router as api_router

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

load_dotenv(BASE_DIR / ".env")

API_TITLE = os.getenv("API_TITLE", "ASTRA-HAR Backend")
API_VERSION = os.getenv("API_VERSION", "0.1.0-placeholder")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
RELOAD = os.getenv("RELOAD", "true").lower() == "true"
SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "true").lower() == "true"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]

app = FastAPI(title=API_TITLE, version=API_VERSION)

# Dev-time CORS: the frontend can also be opened from a different origin
# (a separate static server, or a plain file:// open) and still reach this
# API — mock mode never depends on it, but "Attempt Backend Connection" on
# the Settings page does.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

if SERVE_FRONTEND and FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=RELOAD)
