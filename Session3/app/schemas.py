from typing import List, Optional, Any, Dict
from pydantic import BaseModel


class Artifact(BaseModel):
    type: str
    url: str
    caption: Optional[str] = None


class ToolCall(BaseModel):
    name: str
    args: Dict[str, Any]


class Step(BaseModel):
    iteration: int
    llm_response: str
    tool_call: Optional[ToolCall] = None
    tool_result_summary: Optional[str] = None


class ChatRequest(BaseModel):
    message: Optional[str] = None
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    final_answer: str
    messages: List[Dict[str, str]]
    steps: List[Step]
    artifacts: List[Artifact]
    logs_text: str
