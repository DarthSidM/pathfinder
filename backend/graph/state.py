from typing import TypedDict, Literal


class AgentState(TypedDict, total=False):
    # input (set by run_turn at graph entry)
    user_message: str
    snapshot: dict

    # planner
    intent: Literal["knowledge_update", "fill_form", "chat_only"]

    # knowledge
    knowledge: dict
    knowledge_op: dict | None
    knowledge_error: str | None

    # interact loop
    decision: dict
    history: list[dict]
    actions_taken: int
    consecutive_failures: int

    # pending action (while interrupted)
    pending_action_id: str | None
    action_result: dict | None

    # output
    response_kind: Literal["bot_chat", "task_complete"]
    response_text: str
    response_reason: str | None