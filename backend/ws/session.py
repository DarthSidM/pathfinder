from typing import Any


class SessionStore:
    """
    In-memory session registry, keyed by thread_id (the side-panel UUID).
    Holds the compiled graph and any per-session metadata.
    Destroyed when the WS connection closes.
    """

    def __init__(self, graph: Any):
        self._graph = graph
        self._threads: set[str] = set()

    def start(self, thread_id: str) -> None:
        self._threads.add(thread_id)

    def end(self, thread_id: str) -> None:
        self._threads.discard(thread_id)
        # LangGraph's MemorySaver checkpoints are kept in memory;
        # to fully release them we'd need the checkpointer reference.
        # For v1, "ending" just forgets the thread_id. The checkpointer
        # entry becomes unreachable and is GC'd with the process.
        # If memory pressure matters later, pass a checkpointer and
        # delete the thread's checkpoint explicitly.

    def is_active(self, thread_id: str) -> bool:
        return thread_id in self._threads

    @property
    def graph(self):
        return self._graph