from typing import Dict, List, Any
from collections import deque
import threading


class SessionStore:
    def __init__(self, max_messages: int = 10, max_steps: int = 12):
        self._lock = threading.Lock()
        self._messages: Dict[str, deque] = {}
        self._steps: Dict[str, deque] = {}
        self.max_messages = max_messages
        self.max_steps = max_steps

    def get_context(self, session_id: str) -> Dict[str, List[Any]]:
        with self._lock:
            msgs = list(self._messages.get(session_id, deque()))
            steps = list(self._steps.get(session_id, deque()))
        return {"messages": msgs, "steps": steps}

    def append(self, session_id: str, user_message: str, assistant_message: str, steps: List[Dict[str, Any]]):
        with self._lock:
            if session_id not in self._messages:
                self._messages[session_id] = deque(maxlen=self.max_messages)
            if session_id not in self._steps:
                self._steps[session_id] = deque(maxlen=self.max_steps)
            self._messages[session_id].append({"role": "user", "content": user_message})
            self._messages[session_id].append({"role": "assistant", "content": assistant_message})
            for s in steps:
                self._steps[session_id].append(s)


# Singleton instance
SESSION_STORE = SessionStore()
