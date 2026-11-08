
import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

function App() {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    setLoading(true);
    setError("");
    setSnapshot(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_FORM"
      });

      if (!response?.success) {
        throw new Error(response?.error || "Analysis failed.");
      }

      if (!response.data?.success) {
        throw new Error(
          response.data?.error || "Could not inspect the page."
        );
      }

      setSnapshot(response.data.snapshot);
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

      {snapshot && (
        <div>
          <h3>{snapshot.title}</h3>

          <p>
            Found {snapshot.field_count} fields
          </p>

          {snapshot.fields.map(field => (
            <div
              key={field.element_id}
              style={{
                border: "1px solid #ddd",
                padding: "10px",
                marginBottom: "10px",
                borderRadius: "6px"
              }}
            >
              <strong>{field.label || field.name || field.element_id}</strong>
              <p>Type: {field.type}</p>
              <p>Required: {field.required ? "Yes" : "No"}</p>
              <p>Element ID: {field.element_id}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
