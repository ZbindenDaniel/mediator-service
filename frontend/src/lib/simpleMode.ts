const SIMPLE_MODE_STORAGE_KEY = 'simpleMode';
const SIMPLE_MODE_BODY_CLASS = 'simple-mode';

export function getSimpleMode(): boolean {
  try {
    return localStorage.getItem(SIMPLE_MODE_STORAGE_KEY) === 'true';
  } catch (err) {
    console.error('Failed to read simple mode', err);
    return false;
  }
}

// Visibility is driven entirely by a body class + CSS rules, so toggling is a
// single imperative class flip rather than React state threaded through the tree.
export function applySimpleModeClass(enabled: boolean = getSimpleMode()): void {
  try {
    document.body.classList.toggle(SIMPLE_MODE_BODY_CLASS, enabled);
  } catch (err) {
    console.error('Failed to apply simple mode class', err);
  }
}

export function setSimpleMode(enabled: boolean): void {
  try {
    localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to persist simple mode', err);
  }
  applySimpleModeClass(enabled);
}
