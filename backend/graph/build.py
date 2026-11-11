from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from .state import AgentState
from .nodes import (
    planner,
    retrieve_knowledge,
    knowledge_update,
    interact,
    execute_action,
    verify_result,
    response,
)


STUB_LOOP_LIMIT = 3


def build_graph():
    g = StateGraph(AgentState)

    g.add_node("planner", planner)
    g.add_node("retrieve_knowledge", retrieve_knowledge)
    g.add_node("knowledge_update", knowledge_update)
    g.add_node("interact", interact)
    g.add_node("execute_action", execute_action)
    g.add_node("verify_result", verify_result)
    g.add_node("response", response)

    g.add_edge(START, "planner")

    g.add_conditional_edges(
        "planner",
        lambda s: s["intent"],
        {
            "knowledge_update": "retrieve_knowledge",
            "fill_form": "retrieve_knowledge",
            "chat_only": "retrieve_knowledge",
        },
    )

    g.add_conditional_edges(
        "retrieve_knowledge",
        lambda s: s["intent"],
        {
            "knowledge_update": "knowledge_update",
            "fill_form": "interact",
            "chat_only": "response",
        },
    )

    g.add_edge("knowledge_update", "response")
    g.add_edge("interact", "execute_action")
    g.add_edge("execute_action", "verify_result")

    g.add_conditional_edges(
        "verify_result",
        lambda s: "more" if s["actions_taken"] < STUB_LOOP_LIMIT else "done",
        {"more": "interact", "done": "response"},
    )

    g.add_edge("response", END)

    return g.compile(checkpointer=MemorySaver())