from ..state import AgentState


def interact(state: AgentState) -> dict:
    # STEP 1 STUB: always emit the same fake action so we can test interrupt.
    # Real impl: LLM call with the Interactor prompt + current knowledge/snapshot.
    return {
        "decision": {
            "status": "action",
            "action": {
                "type": "fill",
                "element_id": "element_1",
                "value": "stub_value",
            },
            "reason": "stub",
            "message": "Filling element_1 (stub).",
        }
    }