
(() => {
  // Prevent duplicate event listeners when the script is injected again.
  if (window.__JOB_ASSISTANT_INITIALIZED__) {
    console.log("[Job Assistant] Content script already initialized.");
    return;
  }

  window.__JOB_ASSISTANT_INITIALIZED__ = true;

  console.log("[Job Assistant] Content script initialized.");

  let elementCounter = 0;
  let containerCounter = 0;

  const elementIds = new WeakMap();
  const containerIds = new WeakMap();
  const containers = new Map();

  const INTERACTIVE_SELECTOR = [
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='combobox']",
    "[role='listbox']",
    "[role='radio']",
    "[role='checkbox']",
    "[role='switch']",
    "[role='textbox']"
  ].join(",");

  function isVisible(element) {
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
      elementIds.set(element, `element_${++elementCounter}`);
    }

    return elementIds.get(element);
  }

  function getContainerId(element) {
    if (!containerIds.has(element)) {
      containerIds.set(element, `container_${++containerCounter}`);
    }

    return containerIds.get(element);
  }

  function getExplicitLabel(element) {
    const labels = [];

    if (element.labels) {
      for (const label of element.labels) {
        const text = getText(label, 200);

        if (text) {
          labels.push(text);
        }
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

          if (text) {
            labels.push(text);
          }
        }
      }
    }

    return [...new Set(labels)];
  }

  function getContainer(element) {
    const tag = element.tagName.toLowerCase();

    if (!["div", "fieldset", "section", "li", "label"].includes(tag)) {
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

      if (id) {
        result.push(id);
      }

      current = current.parentElement;
      depth++;
    }

    return result;
  }

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

  function inspectElement(element) {
    const tag = element.tagName.toLowerCase();

    return {
      element_id: getElementId(element),
      tag,

      type:
        element.getAttribute("type") ||
        element.getAttribute("role") ||
        tag,

      name: element.getAttribute("name"),
      html_id: element.id || null,
      placeholder: element.getAttribute("placeholder"),
      aria_label: element.getAttribute("aria-label"),
      aria_labelledby: element.getAttribute("aria-labelledby"),
      autocomplete: element.getAttribute("autocomplete"),

      required:
        element.required ||
        element.getAttribute("aria-required") === "true",

      disabled: element.disabled || false,

      labels: getExplicitLabel(element),
      options: getOptions(element),

      containers: getAncestorContainers(element)
    };
  }

  function inspectForm() {
    containers.clear();

    const elements = [
      ...document.querySelectorAll(INTERACTIVE_SELECTOR)
    ].filter(element => isVisible(element) && !element.disabled);

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

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      console.log(
        "[Job Assistant] Received message:",
        message.type
      );

      if (message.type === "INSPECT_FORM") {
        try {
          const snapshot = inspectForm();

          console.log(
            "[Job Assistant] Inspected fields:",
            snapshot.field_count
          );

          sendResponse({
            success: true,
            snapshot
          });
        } catch (error) {
          console.error(
            "[Job Assistant] Inspection error:",
            error
          );

          sendResponse({
            success: false,
            error: error.message
          });
        }
      }

      return false;
    }
  );
})();
