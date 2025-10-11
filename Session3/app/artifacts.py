import os
import uuid
from typing import Tuple

ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)


def save_matplotlib_figure(plt, caption: str = "") -> Tuple[str, str]:
    filename = f"artifact_{uuid.uuid4().hex}.png"
    path = os.path.join(ARTIFACTS_DIR, filename)
    plt.savefig(path, bbox_inches="tight")
    plt.close()
    url = f"/artifacts/{filename}"
    return url, caption
