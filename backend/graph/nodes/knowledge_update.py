import yaml
from langgraph.config import get_stream_writer

from ...knowledge import store
from ...llm.provider import LLMProvider
from ..state import AgentState


SYSTEM_PROMPT = """You are a knowledge editor for a personal job-application assistant.

The user is telling you something to remember. You must decide how to update
the YAML knowledge document.

You are given:
1. The user's message.
2. The current knowledge as YAML.

Decide ONE operation:

- "set":   Update or create a single scalar value at a dotted path.
           Use when the user replaces a value, e.g. "my email is x" →
           operation=set, path=personal.email, value="x".
           If the section doesn't exist yet, still use set — it will be created.

- "append": Add one or more entries to an existing or new list section.
            Use when the user is adding new projects, jobs, education, etc.
            If a related existing section exists (e.g. "experience" already
            contains jobs), put the new entry under that same section.
            Use consistent section names: personal, education, experience,
            projects, skills, answers.

Rules:
- Path uses dot notation. Top-level sections must be snake_case.
- Do NOT invent values. Use exactly what the user provided.
- If the user provides multiple items (e.g. two projects), use append with
  multiple entries in one operation.
- Return only JSON matching the schema.
"""


UPDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "operation": {"type": "string", "enum": ["set", "append"]},
        "path": {"type": "string"},
        "value": {"type": ["string", "number", "boolean", "null"]},
        "entries": {
            "type": "array",
            "items": {"type": "object"},
        },
    },
    "required": ["operation", "path"],
    "additionalProperties": False,
}


async def knowledge_update(state: AgentState) -> dict:
    writer = get_stream_writer()
    writer({
        "type": "AGENT_STATUS",
        "payload": {"stage": "updating_knowledge", "message": "Updating your knowledge..."},
    })

    user_message = state.get("user_message", "").strip()
    knowledge = state.get("knowledge") or {}

    if not user_message:
        return {
            "response_kind": "bot_chat",
            "response_text": "I didn't catch what to update.",
            "response_reason": "missing_info",
        }

    # ---- Ask the LLM how to update ----
    llm = LLMProvider()
    try:
        op = await llm.ask_json(
            question=(
                f"User message:\n{user_message}\n\n"
                f"Current knowledge (YAML):\n"
                f"{yaml.safe_dump(knowledge, sort_keys=False, allow_unicode=True)}"
            ),
            system_prompt=SYSTEM_PROMPT,
            schema=UPDATE_SCHEMA,
            schema_name="knowledge_update",
        )
    except Exception as e:
        return {
            "response_kind": "bot_chat",
            "response_text": f"Sorry, I couldn't parse that update: {e}",
            "response_reason": "llm_error",
        }
    finally:
        await llm.close()

    # ---- Apply the operation ----
    try:
        updated = store.apply_operation(dict(knowledge), op)
        store.save(updated)
    except Exception as e:
        return {
            "response_kind": "bot_chat",
            "response_text": f"I couldn't save that: {e}",
            "response_reason": "validation_error",
        }

    # ---- Human-readable confirmation ----
    if op["operation"] == "set":
        summary = f"Got it — I've set `{op['path']}` to `{op.get('value')}`."
    else:
        n = len(op.get("entries") or [])
        summary = f"Got it — added {n} new entr{'y' if n == 1 else 'ies'} under `{op['path']}`."

    return {
        "response_kind": "bot_chat",
        "response_text": summary,
        "response_reason": None,
    }