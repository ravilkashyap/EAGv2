#!/usr/bin/env python3
import os
import sys
import argparse
import json
import httpx
from dotenv import load_dotenv

API_URL = "https://generativelanguage.googleapis.com/v1/models"


def verify_key(api_key: str) -> tuple[bool, str]:
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(API_URL, params={"key": api_key})
        if r.status_code == 200:
            data = r.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            sample = ", ".join(models[:3]) if models else "no models listed"
            return True, f"Valid key. Models returned: {len(models)} (e.g., {sample})."
        else:
            try:
                payload = r.json()
            except Exception:
                payload = {"text": r.text}
            return False, f"Invalid key or request. Status={r.status_code} Body={json.dumps(payload)}"
    except Exception as e:
        return False, f"Request error: {e}"


def main():
    parser = argparse.ArgumentParser(description="Verify Google Gemini API key.")
    parser.add_argument("--key", help="API key to test (overrides .env)")
    args = parser.parse_args()

    load_dotenv()
    key = (args.key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        print("No API key provided. Use --key or set GEMINI_API_KEY/GOOGLE_API_KEY in .env", file=sys.stderr)
        sys.exit(2)

    ok, msg = verify_key(key)
    print(msg)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
