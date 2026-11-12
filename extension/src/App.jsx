import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Bot, Send } from "lucide-react";

const WS_URL = "ws://localhost:8000/ws";

function App() {
  // --- existing Form Analyzer state ---
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  // --- new: WS + chat state ---
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef(null);

  // scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // resolve active tab once on mount
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) setTabId(tab.id);
    });
  }, []);

  // close WS on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  function appendMessage(role, text, kind) {
    setMessages((prev) => [...prev, { role, text, kind }]);
  }

  // -------- WS lifecycle --------
  function connectWS() {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }

      setConnecting(true);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "HELLO", payload: {} }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        if (message.type === "SESSION_STARTED") {
          setThreadId(message.payload.thread_id);
          setConnected(true);
          setConnecting(false);
          resolve(ws);
          return;
        }

        if (message.type === "AGENT_STATUS") {
          setStatus(message.payload);
          return;
        }

        if (message.type === "BOT_CHAT") {
          appendMessage("bot", message.payload.text, message.payload.reason);
          setBusy(false);
          return;
        }

        if (message.type === "TASK_COMPLETE") {
          appendMessage("bot", message.payload.summary, "complete");
          setBusy(false);
          return;
        }

        if (message.type === "EXECUTE_ACTION") {
          await handleExecuteAction(message.payload, ws);
          return;
        }

        if (message.type === "ERROR") {
          appendMessage("error", message.payload.message);
          setBusy(false);
          return;
        }
      };

      ws.onerror = () => {
        setConnecting(false);
        reject(new Error("WebSocket error"));
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
      };
    });
  }

  // -------- EXECUTE_ACTION handler --------
  async function handleExecuteAction(payload, ws) {
    const { action_id, action } = payload;

    if (!tabId) {
      console.error("No tabId available to execute action.");
      ws.send(JSON.stringify({
        type: "ACTION_RESULT",
        payload: {
          action_id,
          success: false,
          verified: false,
          error: "No active tab ID.",
          snapshot: { fields: [] }
        }
      }));
      return;
    }

    try {
      // Send the action to content.js
      const result = await chrome.tabs.sendMessage(tabId, {
        type: "EXECUTE_ACTION",
        action: action
      });

      // Forward the result (and updated snapshot) back to FastAPI
      ws.send(JSON.stringify({
        type: "ACTION_RESULT",
        payload: {
          action_id,
          success: result.success,
          verified: result.verified,
          error: result.error || null,
          snapshot: result.snapshot
        }
      }));

    } catch (err) {
      console.error("Error executing action in content script:", err);
      ws.send(JSON.stringify({
        type: "ACTION_RESULT",
        payload: {
          action_id,
          success: false,
          verified: false,
          error: err.message,
          snapshot: { fields: [], page: { url: "", title: "" } }
        }
      }));
    }
  }

  // -------- send a message --------
  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;

    if (!tabId) {
      appendMessage("error", "No active tab found. Make sure you are on a webpage.");
      return;
    }

    appendMessage("user", text);
    setInput("");
    setBusy(true);

    try {
      // 1. Get the real snapshot from content.js before chatting
      const inspectResult = await chrome.tabs.sendMessage(tabId, { type: "INSPECT_FORM" });
      
      if (!inspectResult?.success) {
        throw new Error(inspectResult?.error || "Failed to inspect form.");
      }

      // 2. Connect to WS and send
      const ws = await connectWS();
      ws.send(JSON.stringify({
        type: "HUMAN_CHAT",
        payload: {
          text,
          snapshot: inspectResult.snapshot // Use the real snapshot!
        },
      }));

    } catch (err) {
      appendMessage("error", err.message);
      setBusy(false);
    }
  }

  // ------------------------------------
  // Form Analyzer (unchanged)
  // ------------------------------------
  async function handleAnalyze() {
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: "ANALYZE_FORM" });
      if (!response?.success) throw new Error(response?.error || "Analysis failed.");
      if (!response.data?.success) throw new Error(response.data?.error || "Form analysis failed.");
      setAnalysis(response.data.analysis);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------
  // UI
  // ------------------------------------
  return (
    <div style={{ padding: "16px", fontFamily: "Arial", maxWidth: 720 }}>
      <h2>Job Application Assistant</h2>

      <p style={{ fontSize: 12, color: "#666" }}>
        {connecting && "Connecting..."}
        {connected && `Connected (thread ${threadId?.slice(0, 8)})`}
        {!connected && !connecting && "Not connected"}
        {tabId && ` · Tab ${tabId}`}
      </p>

      <button onClick={handleAnalyze} disabled={loading || busy}>
        {loading ? <><Loader2 size={16} /> Analyzing...</> : <><Search size={16} /> Analyze Form</>}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Chat area */}
      <div style={{
        marginTop: 20, border: "1px solid #ddd", borderRadius: 6,
        height: 320, overflowY: "auto", padding: 10, background: "#fafafa"
      }}>
        {messages.length === 0 && <p style={{ color: "#999" }}>Send a message to start.</p>}
        {messages.map((m, i) => (
          <div key={i} style={{
            margin: "6px 0",
            textAlign: m.role === "user" ? "right" : "left",
          }}>
            <span style={{
              display: "inline-block", padding: "6px 10px", borderRadius: 8,
              background: m.role === "user" ? "#d0e7ff" :
                         m.role === "error" ? "#ffd0d0" : "#e8e8e8",
              maxWidth: "80%", whiteSpace: "pre-wrap",
            }}>
              {m.text}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {status && (
        <p style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
          <Bot size={12} style={{ verticalAlign: "middle" }} /> {status.stage}: {status.message}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={busy ? "Waiting..." : "Ask or instruct..."}
          disabled={busy}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={handleSend} disabled={busy || !input.trim()}>
          {busy ? <Loader2 size={16} /> : <Send size={16} />}
        </button>
      </div>

      {/* Form Analyzer results — unchanged */}
      {analysis && ( /* ...keep your existing rendering... */ null)}
    </div>
  );
}

export default App;