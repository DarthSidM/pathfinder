
console.log("[Job Assistant] Background service worker loaded.");

// Open the side panel when the extension toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
});

// Listen for requests from the React side panel.
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.type === "ANALYZE_FORM") {
      analyzeActiveTab()
        .then(result => {
          sendResponse(result);
        })
        .catch(error => {
          console.error(
            "[Job Assistant] Analysis failed:",
            error
          );

          sendResponse({
            success: false,
            error: error.message
          });
        });

      return true;
    }

    return false;
  }
);

async function analyzeActiveTab() {
  // 1. Find the active tab.
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error("No supported active tab found.");
  }

  console.log("[Job Assistant] Analyzing:", tab.url);

  // 2. Inject the content script.
  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ["content.js"]
    });

    console.log(
      "[Job Assistant] Injection completed:",
      injectionResults
    );
  } catch (error) {
    throw new Error(
      `Content script injection failed: ${error.message}`
    );
  }

  // 3. Request the DOM snapshot.
  let inspection;

  try {
    inspection = await chrome.tabs.sendMessage(tab.id, {
      type: "INSPECT_FORM"
    });
  } catch (error) {
    console.error(
      "[Job Assistant] Content script messaging failed:",
      error
    );

    throw new Error(
      "Could not communicate with the webpage. Refresh the webpage and try again."
    );
  }

  if (!inspection?.success) {
    throw new Error(
      inspection?.error || "Content script inspection failed."
    );
  }

  console.log(
    "[Job Assistant] Snapshot received:",
    inspection.snapshot.field_count,
    "fields"
  );

  // 4. Send the snapshot to FastAPI.
  let response;

  try {
    response = await fetch(
      "http://localhost:8000/api/forms/analyze",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          snapshot: inspection.snapshot
        })
      }
    );
  } catch (error) {
    throw new Error(
      `Could not connect to FastAPI: ${error.message}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Backend error (${response.status}): ${errorText}`
    );
  }

  // 5. Return backend response to React.
  const result = await response.json();

  console.log("[Job Assistant] Backend response received.");

  return {
    success: true,
    data: result
  };
}
