import os
import time
import logging
from typing import Optional
from google import genai
from google.genai.types import Part


class GeminiClient:
    def __init__(self, model_name: str = "gemini-2.5-flash"):
        # Prefer already-exported env; avoid implicit search that can fail under uvicorn
        key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
        if not key:
            # Fallback: explicitly load .env from project root
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
            env_path = os.path.join(project_root, ".env")
            if os.path.exists(env_path):
                for line in open(env_path):
                    if line.strip() and not line.strip().startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
                key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
        # Remove accidental quotes
        key = key.strip().strip('"').strip("'")
        if not key:
            raise RuntimeError("Missing API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env")
        self.api_key = key
        self.model_name = model_name
        self.logger = logging.getLogger(__name__)
        try:
            self.client = genai.Client(api_key=self.api_key)
        except Exception as e:
            raise RuntimeError(f"Failed to configure Gemini client: {e}")

    def _is_transient_error(self, err: Exception) -> bool:
        msg = str(err)
        transient_tokens = [
            "UNAVAILABLE", "temporarily", "Timeout", "DEADLINE_EXCEEDED", "try again",
            "503", "500", "502", "429", "Rate"
        ]
        return any(tok in msg for tok in transient_tokens)

    def _with_retry(self, func, *args, **kwargs):
        max_attempts = 4
        base_delay = 0.6
        for attempt in range(1, max_attempts + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if attempt < max_attempts and self._is_transient_error(e):
                    delay = base_delay * (2 ** (attempt - 1))
                    self.logger.warning(f"Transient error: {e}. Retrying in {delay:.1f}s (attempt {attempt}/{max_attempts})")
                    time.sleep(delay)
                    continue
                raise

    def generate(self, prompt: str) -> str:
        try:
            resp = self._with_retry(
                self.client.models.generate_content,
                model=self.model_name,
                contents=prompt
            )
            return (resp.text or "").strip()
        except Exception as e:
            raise RuntimeError(f"Gemini text error: {e}")

    def ocr_image(self, image_bytes: bytes) -> str:
        try:
            image_part = Part.from_bytes(data=image_bytes, mime_type="image/png")
            resp = self._with_retry(
                self.client.models.generate_content,
                model="gemini-2.0-flash",
                contents=[
                    "Extract the text of the question in the image with no extra commentary.",
                    image_part,
                ],
            )
            return (resp.text or "").strip()
        except Exception as e:
            raise RuntimeError(f"Gemini vision error: {e}")