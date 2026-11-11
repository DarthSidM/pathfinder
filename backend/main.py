from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket

from backend.graph.build import build_graph
from backend.ws.session import SessionStore
from backend.ws.handler import handle_websocket


@asynccontextmanager
async def lifespan(app: FastAPI):
    graph = build_graph()
    app.state.sessions = SessionStore(graph)
    yield


app = FastAPI(lifespan=lifespan)


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await handle_websocket(websocket, websocket.app.state.sessions)