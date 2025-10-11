from typing import List, Dict, Any, Optional, Tuple
import ast
import json
import re
from .gemini_client import GeminiClient
from . import tools as math_tools
from .logging_utils import log_agent_io, get_session_logger

SYSTEM_PROMPT = (
    "You are a math agent for students. You can only do math, statistics, and plotting.\n"
    "Render answers as rich text with short headings (###), bullet points, and inline math like $y=(c-ax)/b$.\n"
    "CRITICAL OUTPUT POLICY: In every turn you must produce EXACTLY ONE of these, nothing else - no plain text without these formats:\n"
    "1) FUNCTION_CALL: tool_name|{json_args}\n"
    "2) FINAL_ANSWER: text (well-formatted, self-contained) which is sent to the user showing detailed answer for the question\n\n"
    "Available tools (JSON args):\n"
    "- solve_quadratic: {\"a\":number, \"b\":number, \"c\":number}\n"
    "- plot_histogram: {\"numbers\":[number,...], \"bins\":number?}\n"
    "- plot_function: {\"expr\":string, \"x_min\":number, \"x_max\":number, \"points\":number?}\n"
    "- plot_multi_functions: {\"expressions\":[string,...], \"x_min\":number, \"x_max\":number, \"points\":number?, \"labels\":[string,...]?}\n"
    "- basic_stats: {\"numbers\":[number,...]}\n"
    "- plot_histogram_from_table: {\"classes\":[\"a-b\",...], \"frequencies\":[int,...]}\n"
    "- grouped_mode: {\"classes\":[\"a-b\",...], \"frequencies\":[int,...]}\n\n"
    "Guidance:\n"
    "- For grouped table (class-frequency) histogram: call plot_histogram_from_table then grouped_mode.\n"
    "- Use strictly valid JSON (double quotes). Numbers must be numbers.\n"
    "- If a plot is generated, simply say a plot was produced; do NOT output URLs.\n"
    "- Never say \"I already answered\"; always end with FINAL_ANSWER when no more tools are needed.\n"
    "- When giving answers:  \n"
    "- Use rich formatting with short section headings (###), bullet points, and inline math (e.g., $y=(c-ax)/b$).  \n"
    "- Explanations must be descriptive and pedagogical — not just the result, but *why* and *how* the solution works. Aim to help the student understand, not just get the answer.  \n"
)


def parse_tool_call(llm_text: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    if not llm_text.startswith("FUNCTION_CALL:"):
        return None, None
    _, rest = llm_text.split(":", 1)
    if "|" not in rest:
        return None, None
    name, arg_str = rest.split("|", 1)
    name = name.strip()
    arg_str = arg_str.strip()
    # Try JSON first
    try:
        args = json.loads(arg_str)
        if isinstance(args, dict):
            return name, args
    except Exception:
        pass
    # Try Python-like dict with single quotes
    try:
        literal = ast.literal_eval(arg_str)
        if isinstance(literal, dict):
            return name, literal
    except Exception:
        pass
    # Try relaxed key=value pairs
    args: Dict[str, Any] = {}
    for pair in arg_str.split(","):
        if "=" in pair:
            k, v = pair.split("=", 1)
            args[k.strip()] = v.strip()
    return name, args if args else None


def compute_allowed_tools(query: str) -> List[str]:
    q = (query or "").lower()
    allowed: List[str] = []
    if any(k in q for k in ["histogram", "class", "frequency", "grouped", "table"]):
        allowed += ["plot_histogram_from_table", "grouped_mode"]
    if any(k in q for k in ["mode"]):
        if "grouped_mode" not in allowed:
            allowed.append("grouped_mode")
    if any(k in q for k in ["plot", "graph", "y=", "function of x", "same graph", "both lines"]):
        allowed += ["plot_multi_functions", "plot_function"]
    if any(k in q for k in ["mean", "median", "std", "statistics"]):
        allowed.append("basic_stats")
    if any(k in q for k in ["quadratic", "roots"]):
        allowed.append("solve_quadratic")
    # If nothing matched, allow no tools (LLM must ask for clarification or FINAL_ANSWER)
    return list(dict.fromkeys(allowed))


def format_next_prompt(query: str, history_summaries: List[str], prior_messages: List[Dict[str, str]], prior_steps: List[Dict[str, Any]], allowed_tools: List[str]) -> str:
    msgs = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in prior_messages[-6:]])
    steps = "\n".join([
        f"Prev Step {s['iteration']}: {s['llm_response']} | Tool: {s.get('tool_call')} | Result: {s.get('tool_result_summary')}"
        for s in prior_steps[-6:]
    ])
    history_block = "\n\n".join(filter(None, [msgs, steps, "\n".join(history_summaries)]))
    allowed_text = ", ".join(allowed_tools) if allowed_tools else "(no tools allowed; produce FINAL_ANSWER)"
    directive = (
        f"Only use these tools if needed: {allowed_text}.\n"
        "Either: (a) call the NEXT necessary allowed tool, or (b) if no more tools are needed, respond with FINAL_ANSWER.\n"
        "Do NOT output free-form assistant text. Output only FUNCTION_CALL or FINAL_ANSWER."
    )
    return f"{SYSTEM_PROMPT}\n\nContext:\n{history_block}\n\nQuery: {query}\n\n{directive}"


def run_agent(
    client: GeminiClient,
    initial_query: str,
    max_iterations: int = 6,
    prior_messages: Optional[List[Dict[str, str]]] = None,
    prior_steps: Optional[List[Dict[str, Any]]] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    session_logger = get_session_logger(session_id)
    prior_messages = prior_messages or []
    prior_steps = prior_steps or []
    steps: List[Dict[str, Any]] = []
    messages: List[Dict[str, str]] = [{"role": "user", "content": initial_query}]
    iteration_response: List[str] = []
    current_query = initial_query
    final_answer = ""
    artifacts: List[Dict[str, str]] = []
    allowed_tools = compute_allowed_tools(initial_query)

    for i in range(max_iterations):
        prompt = format_next_prompt(current_query, iteration_response, prior_messages + messages, prior_steps + steps, allowed_tools)
        llm_text = client.generate(prompt)
        try:
            log_agent_io(session_logger, prompt, llm_text)
        except Exception:
            pass
        tool_name, tool_args = parse_tool_call(llm_text)
        step: Dict[str, Any] = {"iteration": i + 1, "llm_response": llm_text}

        if tool_name:
            # Enforce allowed tools
            if tool_name not in allowed_tools:
                step["tool_call"] = {"name": tool_name, "args": tool_args or {}}
                step["tool_result_summary"] = "Skipped: tool not required by the user's request"
                iteration_response.append("Tool skipped. Please proceed to FINAL_ANSWER if nothing else is needed.")
                current_query = "Produce FINAL_ANSWER now summarizing results so far."
                steps.append(step)
                continue

            result_summary = ""
            try:
                if tool_name == "solve_quadratic":
                    a = float(tool_args.get("a"))
                    b = float(tool_args.get("b"))
                    c = float(tool_args.get("c"))
                    res = math_tools.solve_quadratic(a, b, c)
                    result_summary = res["explanation"]
                elif tool_name == "plot_histogram":
                    numbers = [float(x) for x in tool_args.get("numbers", [])]
                    bins = int(tool_args.get("bins", 10))
                    url, caption = math_tools.plot_histogram(numbers, bins)
                    artifacts.append({"type": "image", "url": url, "caption": caption})
                    result_summary = caption
                elif tool_name == "plot_function":
                    expr = str(tool_args.get("expr"))
                    x_min = float(tool_args.get("x_min", -10))
                    x_max = float(tool_args.get("x_max", 10))
                    points = int(tool_args.get("points", 400))
                    url, caption = math_tools.plot_function(expr, x_min, x_max, points)
                    artifacts.append({"type": "image", "url": url, "caption": caption})
                    result_summary = caption
                elif tool_name == "plot_multi_functions":
                    expressions = [str(x) for x in tool_args.get("expressions", [])]
                    x_min = float(tool_args.get("x_min", -10))
                    x_max = float(tool_args.get("x_max", 10))
                    points = int(tool_args.get("points", 400))
                    labels = tool_args.get("labels")
                    if labels is not None:
                        labels = [str(l) for l in labels]
                    url, caption = math_tools.plot_multi_functions(expressions, x_min, x_max, points, labels)
                    artifacts.append({"type": "image", "url": url, "caption": caption})
                    result_summary = caption
                elif tool_name == "basic_stats":
                    numbers = [float(x) for x in tool_args.get("numbers", [])]
                    res = math_tools.basic_stats(numbers)
                    result_summary = (
                        f"n={res['count']}, mean={res['mean']:.6g}, median={res['median']:.6g}, std={res['std']:.6g}"
                    )
                elif tool_name == "plot_histogram_from_table":
                    classes = list(tool_args.get("classes", []))
                    frequencies = list(tool_args.get("frequencies", []))
                    url, caption = math_tools.plot_histogram_from_table(classes, frequencies)
                    artifacts.append({"type": "image", "url": url, "caption": caption})
                    result_summary = caption
                elif tool_name == "grouped_mode":
                    classes = list(tool_args.get("classes", []))
                    frequencies = list(tool_args.get("frequencies", []))
                    res = math_tools.grouped_mode(classes, frequencies)
                    result_summary = res["explanation"]
                else:
                    result_summary = f"Unknown tool: {tool_name}"
            except Exception as e:
                result_summary = f"Tool error: {e}"

            step["tool_call"] = {"name": tool_name, "args": tool_args or {}}
            step["tool_result_summary"] = result_summary
            iteration_response.append(
                f"In iteration {i + 1}, called {tool_name} with {tool_args}, result: {result_summary}"
            )
            # After running an allowed tool, either continue if still needed or move to FINAL_ANSWER
            current_query = (
                "If another computation is needed for THIS user's request, call ONE more allowed tool; "
                "otherwise respond now with FINAL_ANSWER compiling all parts clearly."
            )
        else:
            if llm_text.startswith("FINAL_ANSWER:"):
                final_answer = llm_text.split(":", 1)[1].strip()
                steps.append(step)
                break
            else:
                # Enforce format on the next turn
                messages.append({"role": "assistant", "content": llm_text})
                current_query = (
                    "Your last response did not follow the output policy. "
                    "Output ONLY one of FUNCTION_CALL or FINAL_ANSWER now."
                )

        steps.append(step)

    # Fallback synthesis if the model never produced FINAL_ANSWER
    if not final_answer:
        has_hist = any(s.get("tool_call", {}).get("name") in ("plot_histogram", "plot_histogram_from_table") for s in steps)
        mode_val = None
        for s in steps:
            if s.get("tool_call", {}).get("name") == "grouped_mode":
                m = re.search(r"Mode\s*≈[^=]*=\s*([0-9]+(?:\.[0-9]+)?)", s.get("tool_result_summary", ""))
                if m:
                    mode_val = m.group(1)
                    break
        parts: List[str] = []
        if has_hist or mode_val is not None:
            hist_line = "Histogram rendered for the class–frequency table." if has_hist else ""
            mode_line = f"Mode (grouped): $\approx {mode_val}$" if mode_val is not None else ""
            section = "\n".join(["### Histogram and Mode", hist_line, mode_line]).strip()
            parts.append(section)
        final_answer = "\n\n".join(parts) if parts else "### Result\nComputation complete."

    logs_text = "\n".join(
        [
            f"Step {s['iteration']}: {s['llm_response']} | "
            f"Tool: {s.get('tool_call')} | Result: {s.get('tool_result_summary')}"
            for s in steps
        ]
    )

    return {
        "final_answer": final_answer,
        "messages": prior_messages + messages,
        "steps": steps,
        "all_steps": prior_steps + steps,
        "artifacts": artifacts,
        "logs_text": logs_text,
    }
