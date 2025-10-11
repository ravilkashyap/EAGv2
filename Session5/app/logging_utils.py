import os
import logging
from logging.handlers import RotatingFileHandler
from typing import Optional

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
SESS_DIR = os.path.join(LOG_DIR, 'sessions')
os.makedirs(SESS_DIR, exist_ok=True)


def setup_app_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = os.path.join(LOG_DIR, 'app.log')
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    if any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
        return
    fh = RotatingFileHandler(log_path, maxBytes=2_000_000, backupCount=3)
    fmt = logging.Formatter('%(asctime)s %(levelname)s %(name)s - %(message)s')
    fh.setFormatter(fmt)
    logger.addHandler(fh)


def get_session_logger(session_id: Optional[str]) -> logging.Logger:
    sid = session_id or 'default'
    path = os.path.join(SESS_DIR, f'{sid}.log')
    logger = logging.getLogger(f'session.{sid}')
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        fh = RotatingFileHandler(path, maxBytes=1_000_000, backupCount=2)
        fmt = logging.Formatter('%(asctime)s %(levelname)s - %(message)s')
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    return logger


def log_agent_io(logger: logging.Logger, prompt: str, response: str) -> None:
    logger.info("AGENT_PROMPT_START\n" + prompt)
    logger.info("AGENT_RESPONSE\n" + response)
