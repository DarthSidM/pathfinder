import { INTERACTIVE_SELECTOR } from "../config/selectors.js";

import {
  isVisible,
  getText,
  getExplicitLabel,
  getOptions
} from "./domUtils.js";

import {
  getElementId,
  getContainerId,
  registerElement,
  registerContainer,
  clearElementRegistry,
  clearContainers,
  getContainers
} from "./elementRegistry.js";


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


function getContainer(element) {
  const tag = element.tagName.toLowerCase();

  if (!["div", "fieldset", "section", "li", "label"].includes(tag)) {
    return null;
  }

  const id = getContainerId(element);

  registerContainer(id, {
    container_id: id,
    tag,
    role: element.getAttribute("role"),
    aria_label: element.getAttribute("aria-label"),
    class_name: String(element.className || "").slice(0, 200),
    text: getText(element)
  });

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


function inspectElement(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");

  const elementId = getElementId(element);

  // Register the element for future interaction.
  registerElement(elementId, element);

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


export function inspectForm() {
  clearContainers();

  // Clear old references. IDs remain stable for
  // DOM elements that still exist.
  clearElementRegistry();

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

    containers: getContainers()
  };
}