import uuid

from fastapi import WebSocket, WebSocketDisconnect
from langgraph.types import Command

from .session import SessionStore


async def handle_websocket(websocket: WebSocket, sessions: SessionStore):
    await websocket.accept()

    thread_id: str | None = None

    try:
        # ---- Handshake: client sends { type: "HELLO", payload: {} } ----
        first = await websocket.receive_json()

        if first.get("type") != "HELLO":
            await _send_error(websocket, "Expected HELLO as first message.")
            await websocket.close()
            return

        thread_id = str(uuid.uuid4())
        sessions.start(thread_id)

        await websocket.send_json({
            "type": "SESSION_STARTED",
            "payload": {"thread_id": thread_id},
        })

        # ---- Message loop ----
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
                await websocket.send_json({"type": "PONG", "payload": {}})

            elif msg_type == "CLOSE":
                break

            else:
                await _send_error(websocket, f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        pass

    finally:
        if thread_id:
            sessions.end(thread_id)


async def _handle_human_chat(
    websocket: WebSocket,
    sessions: SessionStore,
    thread_id: str,
    payload: dict,
):
    user_message = (payload.get("text") or "").strip()
    snapshot = payload.get("snapshot") or {}

    if not user_message:
        await _send_error(websocket, "Empty message.")
        return

    graph = sessions.graph
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "user_message": user_message,
        "snapshot": snapshot,
    }

    try:
        # stream_mode="custom" yields only writer() events.
        # chat_only path emits BOT_CHAT from response.py via writer().
        async for event in graph.astream(
            initial_state,
            config=config,
            stream_mode="custom",
        ):
            await websocket.send_json(event)

    except Exception as e:
        await _send_error(websocket, f"Graph error: {e}")


async def _send_error(websocket: WebSocket, message: str):
    try:
        await websocket.send_json({
            "type": "ERROR",
            "payload": {"message": message},
        })
    except Exception:
        pass