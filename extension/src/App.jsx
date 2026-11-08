import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

function App() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

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

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Job Application Assistant</h2>

      <button
        onClick={handleAnalyze}
        disabled={loading}
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

      {analysis && (
        <div>
          <h3>{analysis.form_title || "Detected Form"}</h3>

          <p>
            Found {analysis.questions.length} questions
          </p>

          {/* Detected questions */}
          <h3>Questions</h3>

          {analysis.questions.map(question => (
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

              {question.options.length > 0 && (
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

          {/* Ignored controls */}
          <h3>Ignored Controls</h3>

          {analysis.ignored_controls.map((control, index) => (
            <p key={`${control.control_id}-${index}`}>
              {control.control_id}: {control.reason}
            </p>
          ))}

          {/* Unclassified controls */}
          <h3>Unclassified Controls</h3>

          {analysis.unclassified_controls.map((control, index) => (
            <p key={index}>
              {control.control_id}: {control.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;