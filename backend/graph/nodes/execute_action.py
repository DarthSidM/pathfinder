from langgraph.types import interrupt

from ..state import AgentState


async def execute_action(state: AgentState) -> dict:
    decision = state["decision"]
    action = decision["action"]

    action_id = f"act_{state.get('actions_taken', 0) + 1}"

    # interrupt() re-executes the node on resume — no side effects here.
    # The handler emits EXECUTE_ACTION from the __interrupt__ event.
    result = interrupt({"action_id": action_id, "action": action})

    return {"action_result": result, "pending_action_id": None}