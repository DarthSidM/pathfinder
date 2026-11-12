import uuid
from typing import Awaitable, Callable

from fastapi import WebSocket, WebSocketDisconnect
from langgraph.types import Command

from .session import SessionStore


async def handle_websocket(websocket: WebSocket, sessions: SessionStore):
    await websocket.accept()
    thread_id: str | None = None

    try:
        first = await websocket.receive_json()
        if first.get("type") != "HELLO":
            await _send(websocket, {"type": "ERROR", "payload": {"message": "Expected HELLO as first message."}})
            await websocket.close()
            return

        thread_id = str(uuid.uuid4())
        sessions.start(thread_id)
        await _send(websocket, {"type": "SESSION_STARTED", "payload": {"thread_id": thread_id}})

        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "HUMAN_CHAT":
                await _handle_human_chat(
                    websocket=websocket,
                    sessions=sessions,
                    thread_id=thread_id,
                    payload=message.get("payload") or {},
                )
            elif msg_type == "PING":
                await _send(websocket, {"type": "PONG", "payload": {}})
            elif msg_type == "CLOSE":
                break
            else:
                await _send(websocket, {"type": "ERROR", "payload": {"message": f"Unknown message type: {msg_type}"}})

    except WebSocketDisconnect:
        pass
    finally:
        if thread_id:
            sessions.end(thread_id)


async def _handle_human_chat(websocket, sessions, thread_id, payload):
    user_message = (payload.get("text") or "").strip()
    snapshot = payload.get("snapshot") or {}

    if not user_message:
        await _send(websocket, {"type": "ERROR", "payload": {"message": "Empty message."}})
        return

    graph = sessions.graph
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {"user_message": user_message, "snapshot": snapshot}

    try:
        pending = await _run_until_pause_or_done(graph, initial_state, config, websocket)

        while pending is not None:
            await _send(websocket, {"type": "EXECUTE_ACTION", "payload": pending})

            action_result = await _await_action_result(websocket, pending["action_id"])
            if action_result is None:
                # Client disconnected or errored while we were waiting.
                return

            pending = await _run_until_pause_or_done(
                graph,
                Command(resume=action_result),
                config,
                websocket,
            )

    except Exception as e:
        await _send(websocket, {"type": "ERROR", "payload": {"message": f"Graph error: {e}"}})


async def _run_until_pause_or_done(graph, graph_input, config, websocket) -> dict | None:
    """
    Run (or resume) the graph. Forward custom events to WS.
    If it pauses on interrupt, return the interrupt payload.
    If it finishes, return None.
    """
    pending_action = None

    async for event in graph.astream(
        graph_input, config=config, stream_mode=["custom", "updates"]
    ):
        print(f"\n[DEBUG ASTREAM] {event}")
        
        # Handle depending on whether it's a tuple or not
        if isinstance(event, tuple):
            mode, data = event
        else:
            mode, data = None, event
            
        if mode == "custom":
            await _send(websocket, data)
        elif mode == "updates":
            for node_name, update in data.items():
                if node_name == "__interrupt__":
                    interrupts = update
                    if interrupts:
                        payload = interrupts[0].value
                        if payload and payload.get("action"):
                            pending_action = payload
                elif isinstance(update, dict):
                    # If interact or verify_result set a response, we don't need to wait for an interrupt
                    pass

    return pending_action


async def _await_action_result(websocket, action_id: str) -> dict | None:
    """
    Wait for the client to send ACTION_RESULT with the matching action_id.
    Ignores PINGs. Returns None if the socket closes.
    """
    while True:
        try:
            message = await websocket.receive_json()
        except WebSocketDisconnect:
            return None

        if message.get("type") == "PING":
            await _send(websocket, {"type": "PONG", "payload": {}})
            continue

        if message.get("type") == "ACTION_RESULT":
            payload = message.get("payload") or {}
            if payload.get("action_id") == action_id:
                return payload
            await _send(websocket, {"type": "ERROR", "payload": {"message": f"Unexpected action_id: {payload.get('action_id')}"}})
            continue

        if message.get("type") == "CLOSE":
            return None

        await _send(websocket, {"type": "ERROR", "payload": {"message": f"Unexpected message while waiting for ACTION_RESULT: {message.get('type')}"}})


async def _send(websocket, message: dict):
    try:
        await websocket.send_json(message)
    except Exception:
        pass