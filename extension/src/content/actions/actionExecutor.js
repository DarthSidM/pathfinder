import { FILLABLE_INPUT_TYPES, INTERACTIVE_SELECTOR } from "../config/selectors.js";

import { isVisible } from "../dom/domUtils.js";
import {
  getRegisteredElement
} from "../dom/elementRegistry.js";

import { inspectForm } from "../dom/inspector.js";


function validateAction(action) {
  if (!action || typeof action !== "object") {
    throw new Error("Invalid action.");
  }

  const { type, element_id } = action;

  if (!["fill", "check", "uncheck"].includes(type)) {
    throw new Error(`Unsupported action: ${type}`);
  }

  if (
    typeof element_id !== "string" ||
    !element_id.trim()
  ) {
    throw new Error("Invalid element ID.");
  }

  const element = getRegisteredElement(element_id);

  if (!element) {
    throw new Error(
      `Element ${element_id} not found in the current registry.`
    );
  }

  if (!element.isConnected || !isVisible(element)) {
    throw new Error("Element is not connected or visible.");
  }

  if (
    element.disabled ||
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true"
  ) {
    throw new Error("Element is disabled.");
  }

  if (type === "fill") {
    const isTextArea =
      element instanceof HTMLTextAreaElement;

    const isFillableInput =
      element instanceof HTMLInputElement &&
      FILLABLE_INPUT_TYPES.has(element.type);

    if (!isTextArea && !isFillableInput) {
      throw new Error(
        "Target is not a supported text input."
      );
    }

    if (element.readOnly) {
      throw new Error("Input is read-only.");
    }

    if (typeof action.value !== "string") {
      throw new Error("Fill action requires a string value.");
    }
  }

  if (type === "check" || type === "uncheck") {
    if (
      !(element instanceof HTMLInputElement) ||
      element.type !== "checkbox"
    ) {
      throw new Error(
        "Target is not a native checkbox."
      );
    }
  }

  return element;
}


function executeFill(element, value) {
  element.focus();

  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(
    prototype,
    "value"
  ).set;

  setter.call(element, value);

  element.dispatchEvent(
    new Event("input", { bubbles: true })
  );

  element.dispatchEvent(
    new Event("change", { bubbles: true })
  );
}


function executeCheckbox(element, actionType) {
  const shouldBeChecked = actionType === "check";

  // Avoid toggling if the checkbox already has
  // the requested state.
  if (element.checked !== shouldBeChecked) {
    element.click();
  }
}


function waitForDOMUpdate() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}


export async function executeAction(action) {
  try {
    const element = validateAction(action);

    switch (action.type) {
      case "fill":
        executeFill(element, action.value);
        break;

      case "check":
      case "uncheck":
        executeCheckbox(element, action.type);
        break;

      default:
        throw new Error("Unsupported action.");
    }

    // Allow the website's event handlers and
    // framework rendering to process the action.
    await waitForDOMUpdate();

    // Rebuild the snapshot and refresh the registry.
    const snapshot = inspectForm();

    // Resolve the element again in case the framework
    // replaced the original DOM node.
    const updatedElement =
      getRegisteredElement(action.element_id);

    if (!updatedElement) {
      throw new Error(
        "Element disappeared after the action."
      );
    }

    let verified = false;
    let actualValue = null;

    if (action.type === "fill") {
      actualValue = updatedElement.value;
      verified = actualValue === action.value;
    }

    if (action.type === "check") {
      actualValue = updatedElement.checked;
      verified = actualValue === true;
    }

    if (action.type === "uncheck") {
      actualValue = updatedElement.checked;
      verified = actualValue === false;
    }

    return {
      success: verified,
      action: action.type,
      element_id: action.element_id,
      verified,
      actual_value: actualValue,
      error: verified
        ? null
        : "Action executed but the expected state was not observed.",
      snapshot
    };

  } catch (error) {
    return {
      success: false,
      action: action?.type ?? null,
      element_id: action?.element_id ?? null,
      verified: false,
      error: error.message,
      snapshot: inspectForm()
    };
  }
}


// Retained from the original implementation.
// This is not currently exposed through the message handler.
function validateClickTarget(element) {
  if (!element) {
    throw new Error("Element does not exist.");
  }

  if (!element.isConnected) {
    throw new Error("Element is no longer attached to the DOM.");
  }

  if (!isVisible(element)) {
    throw new Error("Element is not visible.");
  }

  if (element.disabled || element.matches(":disabled")) {
    throw new Error("Element is disabled.");
  }

  if (element.getAttribute("aria-disabled") === "true") {
    throw new Error("Element is aria-disabled.");
  }

  const tag = element.tagName.toLowerCase();
  const type = (element.type || "").toLowerCase();

  // Never submit, reset, or upload files.
  if (
    tag === "input" &&
    ["hidden", "submit", "reset", "image", "file"].includes(type)
  ) {
    throw new Error(`Clicking input type '${type}' is prohibited.`);
  }

  if (
    tag === "button" &&
    ["submit", "reset"].includes(type)
  ) {
    throw new Error(`Clicking button type '${type}' is prohibited.`);
  }

  if (!element.matches(INTERACTIVE_SELECTOR)) {
    throw new Error("Element is not an approved interactive control.");
  }

  return true;
}


export async function executeClick(elementId) {
  const element = getRegisteredElement(elementId);

  if (!element) {
    throw new Error(`Unknown or stale element ID: ${elementId}`);
  }

  validateClickTarget(element);

  console.log("[Job Assistant] Clicking:", elementId, element);

  element.click();

  await waitForDOMUpdate();

  const snapshot = inspectForm();

  return {
    success: true,
    action: "click",
    element_id: elementId,
    snapshot
  };
}