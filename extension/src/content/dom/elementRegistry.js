let elementCounter = 0;
let containerCounter = 0;

const elementIds = new WeakMap();
const elementRegistry = new Map();

const containerIds = new WeakMap();
const containers = new Map();

export function getElementId(element) {
  if (!elementIds.has(element)) {
    elementIds.set(element, `element_${++elementCounter}`);
  }

  return elementIds.get(element);
}

export function getContainerId(element) {
  if (!containerIds.has(element)) {
    containerIds.set(element, `container_${++containerCounter}`);
  }

  return containerIds.get(element);
}

export function registerElement(elementId, element) {
  elementRegistry.set(elementId, element);
}

export function getRegisteredElement(elementId) {
  return elementRegistry.get(elementId);
}

export function clearElementRegistry() {
  elementRegistry.clear();
}

export function clearContainers() {
  containers.clear();
}

export function registerContainer(containerId, data) {
  containers.set(containerId, data);
}

export function getContainers() {
  return [...containers.values()];
}