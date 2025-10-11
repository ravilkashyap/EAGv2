# Math Agent Chrome Plugin + FastAPI Backend

## Setup

1. Backend

```bash
cd /Users/ravil/Documents/TSAI/Session3
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ENV_EXAMPLE.txt .env
# Edit .env and set either GEMINI_API_KEY (preferred) or GOOGLE_API_KEY
chmod +x run.sh
./run.sh
```

2. Verify API key before running (optional but recommended)

```bash
python verify_gemini_key.py           # uses .env
python verify_gemini_key.py --key ABC # test explicit key
```

- Valid output: "Valid key. Models returned: ..."
- Invalid output: shows HTTP status and returned JSON for quick diagnosis.

3. Chrome Extension (MV3)

- Load unpacked: `extension/`. Click the icon to open a full-page chat.

## Troubleshooting

- API key invalid (400):
  - Confirm `.env` contains a valid key from Google AI Studio (no extra spaces).
  - Run `python verify_gemini_key.py` to confirm validity.
  - Restart backend after changing `.env`.
  - Ensure Generative Language API is enabled and key restrictions allow browser/server calls.
- Backend banner says not reachable: confirm the server is running on port 8000 and no firewall blocks it.

## UI Features

- Wide chat layout with avatars (Claude-like aesthetics)
- Drag-and-drop and paste-to-attach images with preview
- Timeline-style progress (understand → process → finish), populated with tool steps
- Dark mode toggle
- Rendered artifacts (plots) inline with captions
- One-click "Copy Logs" for submission

## Agent Behavior

- Iterative loop: Query → LLM → Tool → Result → next Query
- Tools: `solve_quadratic`, `plot_histogram`, `plot_function`, `basic_stats`
- Artifacts saved under `artifacts/` and referenced in final answer
