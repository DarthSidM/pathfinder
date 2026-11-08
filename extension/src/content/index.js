import { registerMessageHandlers } from "./messageHandler.js";


(() => {
  // Prevent duplicate initialization.
  if (window.__JOB_ASSISTANT_INITIALIZED__) {
    console.log("[Job Assistant] Content script already initialized.");
    return;
  }

  window.__JOB_ASSISTANT_INITIALIZED__ = true;

  console.log("[Job Assistant] Content script initialized.");

  registerMessageHandlers();
})();