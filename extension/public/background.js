console.log("[Job Assistant] Background service worker loaded.");

const API_BASE_URL = "http://localhost:8000";
const MAX_AGENT_ACTIONS = 15;

// --------------------------------------------------
// Extension setup
// --------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
});

// --------------------------------------------------
// Message listener
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    // Existing Form Analyzer workflow
    if (message.type === "ANALYZE_FORM") {
      analyzeActiveTab()
        .then(sendResponse)
        .catch(error => {
          console.error("[Job Assistant] Analysis failed:", error);

          sendResponse({
            success: false,
            error: error.message
          });
        });

      return true;
    }

    // New Interactor workflow
    if (message.type === "START_AGENT") {
      const goal = message.goal?.trim();

      if (!goal) {
        sendResponse({
          success: false,
          error: "Please provide an interaction goal."
        });

        return false;
      }

      startAgent(goal)
        .then(sendResponse)
        .catch(error => {
          console.error("[Job Assistant] Agent failed:", error);

          sendResponse({
            success: false,
            status: "error",
            error: error.message
          });
        });

      return true;
    }

    return false;
  }
);

// --------------------------------------------------
// Active tab helpers
// --------------------------------------------------

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error("No supported active tab found.");
  }

  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (error) {
    throw new Error(
      `Content script injection failed: ${error.message}`
    );
  }
}

async function inspectTab(tabId) {
  await ensureContentScript(tabId);

  let result;

  try {
    result = await chrome.tabs.sendMessage(tabId, {
      type: "INSPECT_FORM"
    });
  } catch (error) {
    throw new Error(
      "Could not communicate with the webpage. Refresh the webpage and try again."
    );
  }

  if (!result?.success) {
    throw new Error(
      result?.error || "Could not inspect the webpage."
    );
  }

  return result.snapshot;
}

// --------------------------------------------------
// Backend helper
// --------------------------------------------------

async function postToBackend(endpoint, payload) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
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

  return response.json();
}

// --------------------------------------------------
// Existing Form Analyzer workflow
// --------------------------------------------------

async function analyzeActiveTab() {
  const tab = await getActiveTab();

  console.log("[Job Assistant] Analyzing:", tab.url);

  const snapshot = await inspectTab(tab.id);

  const result = await postToBackend(
    "/api/forms/analyze",
    { snapshot }
  );

  console.log(
    "[Job Assistant] Form analysis completed:",
    result.analysis?.questions?.length,
    "questions"
  );

  return {
    success: true,
    data: result
  };
}

// --------------------------------------------------
// Agent progress reporting
// --------------------------------------------------

function sendAgentProgress(data) {
  chrome.runtime.sendMessage({
    type: "AGENT_PROGRESS",
    ...data
  }).catch(() => {
    // Side panel may be closed. Agent execution can continue.
  });
}

// --------------------------------------------------
// Main agent workflow
// --------------------------------------------------

async function startAgent(goal) {
  const tab = await getActiveTab();

  const tabId = tab.id;
  const history = [];

  let actionCount = 0;

  sendAgentProgress({
    status: "starting",
    message: "Inspecting the application form..."
  });

  try {
    // STEP 1: Inspect webpage
    let snapshot = await inspectTab(tabId);

    sendAgentProgress({
      status: "analyzing",
      message: "Analyzing the application form..."
    });

    // STEP 2: Form Analyzer
    const analyzerResult = await postToBackend(
      "/api/forms/analyze",
      { snapshot }
    );

    const analysis = analyzerResult.analysis;

    if (!analysis || !Array.isArray(analysis.questions)) {
      throw new Error("Invalid Form Analyzer response.");
    }

    console.log(
      "[Job Assistant] Form Analyzer found:",
      analysis.questions.length,
      "questions"
    );

    sendAgentProgress({
      status: "running",
      message: `Found ${analysis.questions.length} questions. Starting interaction...`,
      questionCount: analysis.questions.length,
      actionCount
    });

    // STEP 3: Interactor loop
    while (actionCount < MAX_AGENT_ACTIONS) {

      const interactorResult = await postToBackend(
        "/api/interactor/next-action",
        {
          goal,
          analysis,
          snapshot,
          history
        }
      );

      const decision = interactorResult.decision;

      if (!decision) {
        throw new Error("Interactor returned an invalid decision.");
      }

      console.log(
        "[Job Assistant] Interactor decision:",
        decision
      );

      // STEP 4: Handle terminal decisions
      if (decision.status === "done") {
        sendAgentProgress({
          status: "completed",
          message: decision.message || "Task completed.",
          actionCount
        });

        return {
          success: true,
          status: "done",
          message: decision.message,
          actionCount,
          history
        };
      }

      if (decision.status === "ask_user") {
        sendAgentProgress({
          status: "ask_user",
          message: decision.message,
          actionCount
        });

        return {
          success: true,
          status: "ask_user",
          message: decision.message,
          actionCount,
          history
        };
      }

      if (decision.status === "blocked") {
        sendAgentProgress({
          status: "blocked",
          message: decision.message,
          actionCount
        });

        return {
          success: false,
          status: "blocked",
          message: decision.message,
          actionCount,
          history
        };
      }

      if (decision.status !== "action" || !decision.action) {
        throw new Error("Interactor returned an unsupported decision.");
      }

      // STEP 5: Execute action through Content Script
      sendAgentProgress({
        status: "executing",
        message: decision.message || "Executing action...",
        action: decision.action,
        actionCount
      });

      const execution = await chrome.tabs.sendMessage(tabId, {
        type: "EXECUTE_ACTION",
        action: decision.action
      });

      // STEP 6: Record execution result
      history.push({
        step: actionCount + 1,
        action: decision.action,
        reason: decision.reason,
        execution: {
          success: execution?.success === true,
          verified: execution?.verified === true,
          actual_value: execution?.actual_value ?? null,
          error: execution?.error ?? null
        }
      });

      if (!execution?.success || !execution?.verified) {
        sendAgentProgress({
          status: "error",
          message: execution?.error || "Action execution failed.",
          actionCount
        });

        return {
          success: false,
          status: "action_failed",
          message: execution?.error || "Action execution failed.",
          actionCount,
          history
        };
      }

      // STEP 7: Update snapshot using fresh DOM state
      if (!execution.snapshot) {
        throw new Error(
          "Action executed, but no updated DOM snapshot was returned."
        );
      }

      snapshot = execution.snapshot;
      actionCount++;

      console.log(
        `[Job Assistant] Action ${actionCount} verified:`,
        decision.action
      );

      sendAgentProgress({
        status: "running",
        message: `Completed action ${actionCount}.`,
        actionCount,
        maxActions: MAX_AGENT_ACTIONS
      });
    }

    // STEP 8: Action limit reached
    sendAgentProgress({
      status: "max_actions",
      message: `Stopped after reaching the ${MAX_AGENT_ACTIONS}-action limit.`,
      actionCount
    });

    return {
      success: false,
      status: "max_actions",
      message: `Reached the maximum limit of ${MAX_AGENT_ACTIONS} actions.`,
      actionCount,
      history
    };

  } catch (error) {
    console.error("[Job Assistant] Agent error:", error);

    sendAgentProgress({
      status: "error",
      message: error.message,
      actionCount
    });

    throw error;
  }
}