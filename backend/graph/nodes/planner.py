from langgraph.config import get_stream_writer

from ...llm.provider import LLMProvider
from ..state import AgentState


SYSTEM_PROMPT = SYSTEM_PROMPT = """You are an intent classifier for a personal job-application assistant.

Classify the user's message into exactly one intent.

1. "knowledge_update"
   The user is TELLING you to remember/change/set/update personal information.
   Verbs: "remember", "save", "update", "set", "add", "change", "my new X is"
   Examples:
   - "my new email is x@y.com"
   - "remember that I work at Google"
   - "add this project: ..."
   - "change my phone to 555-1234"

2. "fill_form"
   The user is ASKING you to fill out the current web form.
   Verbs: "fill", "complete", "do", "fill out"
   Requires the word "form" or "application" or clear filler intent.
   Examples:
   - "fill the form"
   - "fill it out for me"
   - "complete this application"

3. "chat_only"
   The user is ASKING A QUESTION or having a conversation.
   Questions about stored info count as chat_only, not knowledge_update.
   Examples:
   - "what's my email?"
   - "do you know my phone number?"
   - "tell me about my education"
   - "hi"
   - "thanks"

CRITICAL RULES:
- A QUESTION ("what is...", "what's...", "tell me...") is ALWAYS "chat_only",
  even if it mentions email/phone/name. Asking ≠ updating.
- Only classify as knowledge_update when the user is GIVING you information
  or INSTRUCTING you to save it.

Return only JSON matching the schema. Do not add explanation.
"""


INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["knowledge_update", "fill_form", "chat_only"],
        }
    },
    "required": ["intent"],
    "additionalProperties": False,
}


async def planner(state: AgentState) -> dict:
    writer = get_stream_writer()
    writer({
        "type": "AGENT_STATUS",
        "payload": {"stage": "planning", "message": "Understanding your message..."},
    })

    user_message = state.get("user_message", "").strip()

    if not user_message:
        return {"intent": "chat_only"}

    llm = LLMProvider()
    try:
        result = await llm.ask_json(
            question=user_message,
            system_prompt=SYSTEM_PROMPT,
            schema=INTENT_SCHEMA,
            schema_name="intent",
        )
        intent = result.get("intent")
        if intent not in ("knowledge_update", "fill_form", "chat_only"):
            intent = "chat_only"
    except Exception as e:
        writer({
            "type": "AGENT_STATUS",
            "payload": {"stage": "planning", "message": f"Classification failed: {e}"},
        })
        intent = "chat_only"
    finally:
        await llm.close()

    return {
        "intent": intent,
        "history": [],
        "actions_taken": 0,
        "consecutive_failures": 0,
    }