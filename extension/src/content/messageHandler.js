import { inspectForm } from "./dom/inspector.js";
import { executeAction } from "./actions/actionExecutor.js";


export function registerMessageHandlers() {
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

      if (message.type === "INSPECT_FORM") {
        try {
          const snapshot = inspectForm();

          sendResponse({
            success: true,
            snapshot
          });

        } catch (error) {
          sendResponse({
            success: false,
            error: error.message
          });
        }

        return false;
      }

      if (message.type === "EXECUTE_ACTION") {
        executeAction(message.action)
          .then(result => {
            sendResponse(result);
          })
          .catch(error => {
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
}