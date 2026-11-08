
(() => {
  // Prevent duplicate initialization.
  if (window.__JOB_ASSISTANT_INITIALIZED__) {
    console.log("[Job Assistant] Content script already initialized.");
    return;
  }

  window.__JOB_ASSISTANT_INITIALIZED__ = true;

  console.log("[Job Assistant] Content script initialized.");

  // ---------------------------------
  // 1. Element registries
  // ---------------------------------

  let elementCounter = 0;
  let containerCounter = 0;

  // DOM element -> generated ID
  const elementIds = new WeakMap();

  // Generated ID -> DOM element
  const elementRegistry = new Map();

  const containerIds = new WeakMap();
  const containers = new Map();

  const INTERACTIVE_SELECTOR = [
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "button",
    "[contenteditable='true']",
    "[role='button']",
    "[role='combobox']",
    "[role='listbox']",
    "[role='option']",
    "[role='menuitem']",
    "[role='tab']",
    "[role='radio']",
    "[role='checkbox']",
    "[role='switch']",
    "[role='textbox']"
  ].join(",");


  // ---------------------------------
  // 2. DOM utilities
  // ---------------------------------

  function isVisible(element) {
    if (!element.isConnected) return false;

    if (element.closest('[aria-hidden="true"], [inert]')) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  }

  function getText(element, maxLength = 400) {
    return (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function getElementId(element) {
    if (!elementIds.has(element)) {
      elementIds.set(
        element,
        `element_${++elementCounter}`
      );
    }

    return elementIds.get(element);
  }

  function getContainerId(element) {
    if (!containerIds.has(element)) {
      containerIds.set(
        element,
        `container_${++containerCounter}`
      );
    }

    return containerIds.get(element);
  }


  // ---------------------------------
  // 3. Label extraction
  // ---------------------------------

  function getExplicitLabel(element) {
    const labels = [];

    if (element.labels) {
      for (const label of element.labels) {
        const text = getText(label, 200);

        if (text) labels.push(text);
      }
    }

    const ariaLabel = element.getAttribute("aria-label");

    if (ariaLabel) {
      labels.push(ariaLabel);
    }

    const labelledBy = element.getAttribute("aria-labelledby");

    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const referenced = document.getElementById(id);

        if (referenced) {
          const text = getText(referenced, 200);

          if (text) labels.push(text);
        }
      }
    }

    return [...new Set(labels)];
  }


  // ---------------------------------
  // 4. Container extraction
  // ---------------------------------

  function getContainer(element) {
    const tag = element.tagName.toLowerCase();

    if (
      !["div", "fieldset", "section", "li", "label"].includes(tag)
    ) {
      return null;
    }

    const id = getContainerId(element);

    if (!containers.has(id)) {
      containers.set(id, {
        container_id: id,
        tag,
        role: element.getAttribute("role"),
        aria_label: element.getAttribute("aria-label"),
        class_name: String(element.className || "").slice(0, 200),
        text: getText(element)
      });
    }

    return id;
  }

  function getAncestorContainers(element) {
    const result = [];

    let current = element.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < 4) {
      const id = getContainer(current);

      if (id) result.push(id);

      current = current.parentElement;
      depth++;
    }

    return result;
  }


  // ---------------------------------
  // 5. Option extraction
  // ---------------------------------

  function getOptions(element) {
    if (element.tagName === "SELECT") {
      return [...element.options].map(option => ({
        text: getText(option, 150),
        value: option.value,
        disabled: option.disabled
      }));
    }

    return [];
  }


  // ---------------------------------
  // 6. Inspectable control filtering
  // ---------------------------------

  function isInspectable(element) {
    if (!isVisible(element)) return false;

    if (element.disabled || element.matches(":disabled")) {
      return false;
    }

    // Exclude controls that could submit or reset a form.
    if (
      element.tagName === "BUTTON" &&
      ["submit", "reset"].includes(element.type)
    ) {
      return false;
    }

    if (
      element.tagName === "INPUT" &&
      ["submit", "reset", "image"].includes(element.type)
    ) {
      return false;
    }

    return true;
  }


  // ---------------------------------
  // 7. Inspect individual elements
  // ---------------------------------

  function inspectElement(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");

    const elementId = getElementId(element);

    // Register the element for future interaction.
    elementRegistry.set(elementId, element);

    return {
      element_id: elementId,

      tag,

      type:
        element.type ||
        role ||
        tag,

      role,

      text: getText(element, 200),

      name: element.getAttribute("name"),
      html_id: element.id || null,

      placeholder: element.getAttribute("placeholder"),
      title: element.getAttribute("title"),

      aria_label: element.getAttribute("aria-label"),
      aria_labelledby: element.getAttribute("aria-labelledby"),

      autocomplete: element.getAttribute("autocomplete"),

      required:
        element.required ||
        element.getAttribute("aria-required") === "true",

      disabled:
        element.disabled ||
        element.getAttribute("aria-disabled") === "true",

      checked:
        typeof element.checked === "boolean"
          ? element.checked
          : null,

      aria_checked: element.getAttribute("aria-checked"),

      expanded: element.getAttribute("aria-expanded"),

      labels: getExplicitLabel(element),

      options: getOptions(element),

      containers: getAncestorContainers(element)
    };
  }


  // ---------------------------------
  // 8. Build DOM snapshot
  // ---------------------------------

  function inspectForm() {
    containers.clear();

    // Clear old references. IDs remain stable for
    // DOM elements that still exist.
    elementRegistry.clear();

    const elements = [
      ...document.querySelectorAll(INTERACTIVE_SELECTOR)
    ].filter(isInspectable);

    const fields = elements.map(inspectElement);

    return {
      page: {
        url: window.location.href,
        title: document.title
      },

      field_count: fields.length,

      fields,

      containers: [...containers.values()]
    };
  }

  
  // ----------------------------------------
  // ACTION EXECUTOR
  // ----------------------------------------

  const FILLABLE_INPUT_TYPES = new Set([
    "text",
    "email",
    "tel",
    "url",
    "search",
    "number",
    "date"
  ]);

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

    const element = elementRegistry.get(element_id);

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


  // ----------------------------------------
  // FILL ACTION
  // ----------------------------------------

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
      new Event("input", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }


  // ----------------------------------------
  // CHECK / UNCHECK ACTION
  // ----------------------------------------

  function executeCheckbox(element, actionType) {
    const shouldBeChecked = actionType === "check";

    // Avoid toggling if the checkbox already has
    // the requested state.
    if (element.checked !== shouldBeChecked) {
      element.click();
    }
  }


  // ----------------------------------------
  // WAIT FOR DOM UPDATE
  // ----------------------------------------

  function waitForDOMUpdate() {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }


  // ----------------------------------------
  // MAIN EXECUTOR
  // ----------------------------------------

  async function executeAction(action) {
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
        elementRegistry.get(action.element_id);

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

  // ---------------------------------
  // 9. Action safety validation
  // ---------------------------------

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

    if (
      element.getAttribute("aria-disabled") === "true"
    ) {
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

    // Only allow controls explicitly collected by our inspector.
    if (!element.matches(INTERACTIVE_SELECTOR)) {
      throw new Error("Element is not an approved interactive control.");
    }

    return true;
  }


  // ---------------------------------
  // 10. Execute click
  // ---------------------------------

  async function executeClick(elementId) {
    const element = elementRegistry.get(elementId);

    if (!element) {
      throw new Error(
        `Unknown or stale element ID: ${elementId}`
      );
    }

    validateClickTarget(element);

    console.log(
      "[Job Assistant] Clicking:",
      elementId,
      element
    );

    element.click();

    // Give synchronous UI updates and rendering
    // a chance to complete.
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    // Re-inspect after the action.
    const snapshot = inspectForm();

    return {
      success: true,
      action: "click",
      element_id: elementId,
      snapshot
    };
  }


  // ---------------------------------
  // 11. Message handling
  // ---------------------------------

  
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
})();
