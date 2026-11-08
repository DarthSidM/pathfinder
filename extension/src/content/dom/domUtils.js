export function isVisible(element) {
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

export function getText(element, maxLength = 400) {
  return (element.innerText || element.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function getExplicitLabel(element) {
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

export function getOptions(element) {
  if (element.tagName === "SELECT") {
    return [...element.options].map(option => ({
      text: getText(option, 150),
      value: option.value,
      disabled: option.disabled
    }));
  }

  return [];
}