"""Vercel serverless entrypoint: exposes the FastAPI app under /api/*."""
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, os.path.normpath(BACKEND_DIR))

from app.main import app  # noqa: E402,F401
