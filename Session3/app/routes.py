from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import Optional
import logging
import asyncio
import time
import os
from fastapi.concurrency import run_in_threadpool

from .gemini_client import GeminiClient
from .agent import run_agent
from .schemas import ChatResponse
from .logging_utils import get_session_logger
from .session_store import SESSION_STORE

router = APIRouter()


@router.post("/api/agent/chat")
async def chat(
    message: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    session_logger = get_session_logger(session_id)
    try:
        # Timeouts (configurable via env)
        OCR_TIMEOUT_S = float(os.getenv("OCR_TIMEOUT_SECONDS", "20"))
        AGENT_TIMEOUT_S = float(os.getenv("AGENT_TIMEOUT_SECONDS", "90"))
        t0 = time.monotonic()
        client = GeminiClient()

        prior = SESSION_STORE.get_context(session_id or 'default')
        prior_messages = prior["messages"]
        prior_steps = prior["steps"]

        ocr_text: Optional[str] = None
        if image is not None:
            content = await image.read()
            session_logger.info(f"Image bytes received: {len(content)} bytes")
            ocr_t0 = time.monotonic()
            try:
                ocr_text = await asyncio.wait_for(
                    run_in_threadpool(client.ocr_image, content), timeout=OCR_TIMEOUT_S
                )
            except asyncio.TimeoutError:
                session_logger.error("OCR timed out")
                return JSONResponse(status_code=504, content={
                    "error": "OCR timed out",
                    "hint": "Try a smaller image or retry later."
                })
            session_logger.info(f"OCR: {ocr_text[:200]}")
            session_logger.info(f"OCR_ms={(time.monotonic()-ocr_t0)*1000:.0f}")
            if message:
                query = f"Image question: {ocr_text}\n\nUser text: {message}"
            else:
                query = f"Image question: {ocr_text}"
        else:
            query = message or ""

        agent_t0 = time.monotonic()
        try:
            result = await asyncio.wait_for(
                run_in_threadpool(
                    run_agent,
                    client,
                    query,
                    prior_messages=prior_messages,
                    prior_steps=prior_steps,
                    session_id=session_id or 'default',
                ),
                timeout=AGENT_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            session_logger.error("Agent timed out")
            return JSONResponse(status_code=504, content={
                "error": "Agent timed out",
                "hint": "The LLM took too long. Please try a shorter query or retry later."
            })

        # Prepend OCR as a step if applicable
        if ocr_text:
            ocr_step = {
                "iteration": 0,
                "llm_response": f"OCR_RESULT: {ocr_text}",
                "tool_call": {"name": "ocr_image", "args": {}},
                "tool_result_summary": ocr_text[:200],
            }
            result["steps"] = [ocr_step] + result.get("steps", [])

        for s in result.get("steps", []):
            session_logger.info(f"Step {s['iteration']}: {s['llm_response']} | Tool: {s.get('tool_call')} | Result: {s.get('tool_result_summary')}")
        total_ms = (time.monotonic() - t0) * 1000
        agent_ms = (time.monotonic() - agent_t0) * 1000
        session_logger.info(f"Final: {result.get('final_answer','')}")
        session_logger.info(f"Durations_ms total={total_ms:.0f} agent={agent_ms:.0f}")

        # persist to session memory
        try:
            SESSION_STORE.append(session_id or 'default', query, result.get('final_answer',''), result.get('steps', []))
        except Exception:
            pass

        return JSONResponse(content=result)
    except Exception as e:
        session_logger.error(f"Error: {e}")
        return JSONResponse(status_code=400, content={
            "error": str(e),
            "hint": "Ensure backend is running, GEMINI_API_KEY is valid in .env, and network is reachable."
        })
