from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import os
import logging
from contextlib import asynccontextmanager

from .logging_utils import setup_app_logging

# Setup logging to file
setup_app_logging()
logger = logging.getLogger(__name__)

# Create artifacts directory if not exists
ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("App starting up")
    # Warn if no API key is present (avoid network calls at startup)
    if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        logger.warning("No GEMINI_API_KEY/GOOGLE_API_KEY set; Gemini features may fail")
    try:
        yield
    finally:
        logger.info("App shutting down, flushing logs")
        root_logger = logging.getLogger()
        for h in list(root_logger.handlers):
            try:
                h.flush()
            except Exception:
                pass


app = FastAPI(title="Math Agent Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"REQ {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"RES {request.method} {request.url.path} -> {response.status_code}")
    return response

app.mount("/artifacts", StaticFiles(directory=ARTIFACTS_DIR), name="artifacts")

from .routes import router as api_router  # noqa: E402
app.include_router(api_router)


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
