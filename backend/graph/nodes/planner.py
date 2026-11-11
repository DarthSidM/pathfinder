from ..state import AgentState


# planner.py (stub, patched)
def planner(state: AgentState) -> dict:
    if state.get("intent"):
        return {}   # caller pre-set intent, respect it
    return {"intent": "fill_form", "history": [], "actions_taken": 0, "consecutive_failures": 0}