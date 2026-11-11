import yaml
from pathlib import Path

from ..state import AgentState


KNOWLEDGE_PATH = Path(__file__).parent.parent.parent / "knowledge" / "knowledge.md"


def retrieve_knowledge(state: AgentState) -> dict:
    """
    Read knowledge.md (YAML) into state.knowledge.
    For chat_only: does not call the LLM — that happens in RESPONSE.
    """
    try:
        raw = KNOWLEDGE_PATH.read_text(encoding="utf-8")
        knowledge = yaml.safe_load(raw) or {}
        if not isinstance(knowledge, dict):
            raise ValueError("knowledge.md must be a YAML mapping at the top level.")
        return {"knowledge": knowledge, "knowledge_error": None}

    except FileNotFoundError:
        return {"knowledge": {}, "knowledge_error": "knowledge.md not found."}

    except yaml.YAMLError as e:
        return {"knowledge": {}, "knowledge_error": f"YAML parse error: {e}"}

    except Exception as e:
        return {"knowledge": {}, "knowledge_error": str(e)}