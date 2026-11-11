from langgraph.types import interrupt
from ..state import AgentState


async def execute_action(state: AgentState) -> dict:
    decision = state["decision"]
    action = decision["action"]

    action_id = f"act_{state.get('actions_taken', 0) + 1}"

    # No writer() call here. Just interrupt with the payload.
    # run_turn will read this payload from the __interrupt__ event
    # in the updates stream and emit EXECUTE_ACTION exactly once.
    result = interrupt({
        "action_id": action_id,
        "action": action,
    })

    return {
        "action_result": result,
        "pending_action_id": None,
    }