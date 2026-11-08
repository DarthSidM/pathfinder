export const INTERACTIVE_SELECTOR = [
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

export const FILLABLE_INPUT_TYPES = new Set([
  "text",
  "email",
  "tel",
  "url",
  "search",
  "number",
  "date"
]);