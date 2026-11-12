from langgraph.config import get_stream_writer

from ..state import AgentState


MAX_ACTIONS = 15
MAX_CONSECUTIVE_FAILURES = 2


def verify_result(state: AgentState) -> dict:
    writer = get_stream_writer()

    decision = state.get("decision") or {}
    result = state.get("action_result") or {}

    actions_taken = state.get("actions_taken", 0) + 1
    success = result.get("success")
    verified = result.get("verified")
    # Accept results from older clients that did not send the verification flag.
    successes = bool(success and verified is not False)
    failures = 0 if successes else state.get("consecutive_failures", 0) + 1

    new_history = (state.get("history") or []) + [{
        "step": actions_taken,
        "action": decision.get("action"),
        "reason": decision.get("reason"),
        "result": {
            "success": result.get("success"),
            "verified": result.get("verified"),
            "error": result.get("error"),
        },
    }]

    base = {
        "actions_taken": actions_taken,
        "consecutive_failures": failures,
        "history": new_history,
    }

    # Propagate fresh snapshot into state so interact sees updated DOM.
    if result.get("snapshot"):
        base["snapshot"] = result["snapshot"]

    if failures >= MAX_CONSECUTIVE_FAILURES:
        writer({"type": "AGENT_STATUS", "payload": {"stage": "verifying", "message": "Too many failures, stopping."}})
        return {
            **base,
            "response_kind": "bot_chat",
            "response_text": f"Stopping after {failures} consecutive failed actions.",
            "response_reason": "action_failed",
        }

    if actions_taken >= MAX_ACTIONS:
        writer({"type": "AGENT_STATUS", "payload": {"stage": "verifying", "message": "Action limit reached."}})
        return {
            **base,
            "response_kind": "task_complete",
            "response_text": f"Stopped after reaching the {MAX_ACTIONS}-action limit.",
        }

    # Loop condition: did the interactor decide "action"? then continue.
    # If it was terminal, propagate to response.
    status = decision.get("status")
    if status == "done":
        return {**base, "response_kind": "task_complete", "response_text": decision.get("message") or "Done."}
    if status == "ask_user":
        return {**base, "response_kind": "bot_chat", "response_text": decision.get("message") or "I need more information.", "response_reason": "missing_info"}
    if status == "blocked":
        return {**base, "response_kind": "bot_chat", "response_text": decision.get("message") or "I can't proceed.", "response_reason": "action_failed"}

    # status == "action" and not failed → loop back to interact
    return base