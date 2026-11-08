
import { useState, useEffect } from "react";
import { Search, Loader2, Bot } from "lucide-react";

function App() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const [agentGoal, setAgentGoal] = useState("");
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentRunning, setAgentRunning] = useState(false);

  // ------------------------------------
  // Form Analyzer
  // ------------------------------------

  async function handleAnalyze() {
    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_FORM"
      });

      if (!response?.success) {
        throw new Error(response?.error || "Analysis failed.");
      }

      if (!response.data?.success) {
        throw new Error(
          response.data?.error || "Form analysis failed."
        );
      }

      setAnalysis(response.data.analysis);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------
  // Agent progress listener
  // ------------------------------------

  useEffect(() => {
    function handleAgentProgress(message) {
      if (message.type !== "AGENT_PROGRESS") return;

      setAgentStatus(message);

      // Update running state when the agent reaches a terminal state.
      if (
        [
          "completed",
          "ask_user",
          "blocked",
          "max_actions",
          "error"
        ].includes(message.status)
      ) {
        setAgentRunning(false);
      }
    }

    chrome.runtime.onMessage.addListener(handleAgentProgress);

    return () => {
      chrome.runtime.onMessage.removeListener(handleAgentProgress);
    };
  }, []);

  // ------------------------------------
  // Start Browser Agent
  // ------------------------------------

  async function handleStartAgent() {
    if (!agentGoal.trim() || agentRunning) return;

    setAgentRunning(true);
    setAgentStatus({
      status: "starting",
      message: "Starting agent..."
    });

    try {
      const result = await chrome.runtime.sendMessage({
        type: "START_AGENT",
        goal: agentGoal.trim()
      });

      if (!result?.success) {
        setAgentStatus({
          status: result?.status || "error",
          message:
            result?.error ||
            result?.message ||
            "Agent failed."
        });
      } else {
        setAgentStatus({
          status: result.status,
          message: result.message,
          actionCount: result.actionCount
        });
      }

    } catch (err) {
      setAgentStatus({
        status: "error",
        message: err.message
      });
    } finally {
      setAgentRunning(false);
    }
  }

  // ------------------------------------
  // UI
  // ------------------------------------

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Job Application Assistant</h2>

      {/* Form Analyzer */}

      <button
        onClick={handleAnalyze}
        disabled={loading || agentRunning}
      >
        {loading ? (
          <>
            <Loader2 size={16} /> Analyzing...
          </>
        ) : (
          <>
            <Search size={16} /> Analyze Form
          </>
        )}
      </button>

      {error && (
        <p style={{ color: "red" }}>{error}</p>
      )}

      {/* Browser Agent */}

      <div style={{ marginTop: "24px" }}>
        <h3>
          <Bot size={18} style={{ verticalAlign: "middle" }} />{" "}
          Browser Agent
        </h3>

        <textarea
          value={agentGoal}
          onChange={(e) => setAgentGoal(e.target.value)}
          placeholder="What should I do on this application?"
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px",
            resize: "vertical"
          }}
          disabled={agentRunning}
        />

        <button
          onClick={handleStartAgent}
          disabled={agentRunning || !agentGoal.trim()}
          style={{ marginTop: "10px" }}
        >
          {agentRunning ? (
            <>
              <Loader2 size={16} /> Agent Running...
            </>
          ) : (
            "Start Agent"
          )}
        </button>

        {agentStatus && (
          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "6px"
            }}
          >
            <strong>
              Status: {agentStatus.status}
            </strong>

            <p>{agentStatus.message}</p>

            {agentStatus.actionCount !== undefined && (
              <p>
                Actions completed: {agentStatus.actionCount}
              </p>
            )}

            {agentStatus.action && (
              <p>
                Current action: {agentStatus.action.type} on{" "}
                {agentStatus.action.element_id}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Form Analysis Results */}

      {analysis && (
        <div style={{ marginTop: "24px" }}>
          <h3>{analysis.form_title || "Detected Form"}</h3>

          <p>
            Found {analysis.questions.length} questions
          </p>

          <h3>Questions</h3>

          {analysis.questions.map((question) => (
            <div
              key={question.question_id}
              style={{
                border: "1px solid #ddd",
                padding: "12px",
                marginBottom: "12px",
                borderRadius: "6px"
              }}
            >
              <strong>{question.question_text}</strong>

              <p>Type: {question.answer_type}</p>

              <p>
                Required: {question.required ? "Yes" : "No"}
              </p>

              <p>
                Confidence: {(question.confidence * 100).toFixed(0)}%
              </p>

              <p>
                Controls: {question.control_ids.join(", ")}
              </p>

              {question.options?.length > 0 && (
                <ul>
                  {question.options.map((option, index) => (
                    <li key={`${option.control_id}-${index}`}>
                      {option.label} ({option.control_id})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <h3>Ignored Controls</h3>

          {analysis.ignored_controls.map((control, index) => (
            <p key={`${control.control_id}-${index}`}>
              {control.control_id}: {control.reason}
            </p>
          ))}

          <h3>Unclassified Controls</h3>

          {analysis.unclassified_controls.map((control, index) => (
            <p key={`${control.control_id}-${index}`}>
              {control.control_id}: {control.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
