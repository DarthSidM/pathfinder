import yaml
from pathlib import Path
from typing import Any


KNOWLEDGE_PATH = Path(__file__).parent / "knowledge.md"


def load() -> dict:
    if not KNOWLEDGE_PATH.exists():
        return {}
    raw = KNOWLEDGE_PATH.read_text(encoding="utf-8")
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        raise ValueError("knowledge.md must be a YAML mapping at the top level.")
    return data


def save(data: dict) -> None:
    KNOWLEDGE_PATH.write_text(
        yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def apply_operation(data: dict, op: dict) -> dict:
    """
    Apply a validated operation to the YAML data. Returns the mutated dict.

    op shape:
      { "operation": "set",    "path": "personal.email", "value": "..." }
      { "operation": "append", "path": "projects",       "entries": [ {...}, ... ] }
    """
    operation = op.get("operation")
    path = op.get("path", "")

    if not path or not isinstance(path, str):
        raise ValueError("Operation is missing a valid path.")

    segments = path.split(".")
    if any(not s or not s.replace("_", "").isalnum() for s in segments):
        raise ValueError(f"Invalid path: {path!r}")

    if operation == "set":
        value = op.get("value")
        if value is None:
            raise ValueError("set operation requires a value.")

        node = data
        for seg in segments[:-1]:
            if seg not in node or not isinstance(node[seg], dict):
                node[seg] = {}
            node = node[seg]
        node[segments[-1]] = value
        return data

    if operation == "append":
        entries = op.get("entries")
        if not isinstance(entries, list) or not entries:
            raise ValueError("append operation requires a non-empty entries list.")

        node = data
        for seg in segments[:-1]:
            if seg not in node or not isinstance(node[seg], dict):
                node[seg] = {}
            node = node[seg]

        leaf = segments[-1]
        if leaf not in node:
            node[leaf] = []
        if not isinstance(node[leaf], list):
            raise ValueError(f"Cannot append to non-list path: {path!r}")
        node[leaf].extend(entries)
        return data

    raise ValueError(f"Unknown operation: {operation!r}")