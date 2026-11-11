from ..state import AgentState


def verify_result(state: AgentState) -> dict:
    # STEP 1 STUB: increment counter, append to history. Real impl:
    # validate success/verified, route more/done/blocked based on real logic.
    n = state.get("actions_taken", 0) + 1
    return {
        "actions_taken": n,
        "history": state.get("history", []) + [
            {"step": n, "result": state.get("action_result")}
        ],
    }