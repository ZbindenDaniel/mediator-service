import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

type Matcher = string | RegExp;

interface RoleOptions {
  name?: Matcher;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function ensureContainer() {
  if (!container) {
    throw new Error('render must be called before using screen.');
  }
  return container;
}

function matchText(content: string | null | undefined, matcher: Matcher) {
  if (content == null) {
    return false;
  }
  const value = content.trim();
  if (typeof matcher === 'string') {
    return value === matcher;
  }
  return matcher.test(value);
}

function queryByText(base: HTMLElement, matcher: Matcher) {
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_ELEMENT, null);
  let current: Node | null = walker.currentNode;
  while (current) {
    if (current instanceof HTMLElement) {
      if (matchText(current.textContent, matcher)) {
        return current;
      }
    }
    current = walker.nextNode();
  }
  return null;
}

function getByText(base: HTMLElement, matcher: Matcher) {
  const result = queryByText(base, matcher);
  if (!result) {
    throw new Error(`Unable to find element with text: ${matcher.toString()}`);
  }
  return result as HTMLElement;
}

function getByLabelText(base: HTMLElement, matcher: Matcher) {
  const labels = Array.from(base.querySelectorAll('label'));
  for (const label of labels) {
    if (!matchText(label.textContent, matcher)) {
      continue;
    }
    if (label.htmlFor) {
      const target = base.querySelector<HTMLElement>(`#${CSS.escape(label.htmlFor)}`);
      if (target) {
        return target;
      }
    }
    const control = label.querySelector<HTMLElement>('input,textarea,select,button');
    if (control) {
      return control;
    }
    const parentControl = label.parentElement?.querySelector<HTMLElement>('input,textarea,select,button');
    if (parentControl) {
      return parentControl;
    }
  }
  throw new Error(`Unable to find label text: ${matcher.toString()}`);
}

function getByRole(base: HTMLElement, role: string, options?: RoleOptions) {
  let candidates: HTMLElement[] = [];
  switch (role) {
    case 'button':
      candidates = Array.from(base.querySelectorAll('button'));
      break;
    case 'textbox':
      candidates = Array.from(base.querySelectorAll('input[type="text"],textarea,input:not([type])'));
      break;
    default:
      candidates = Array.from(base.querySelectorAll(role));
  }

  if (options?.name) {
    candidates = candidates.filter((el) => matchText(el.textContent, options.name!));
  }

  if (candidates.length === 0) {
    throw new Error(`Unable to find element by role: ${role}`);
  }

  return candidates[0];
}

function cleanup() {
  if (root && container) {
    act(() => {
      root?.unmount();
    });
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
  root = null;
  container = null;
}

export function render(ui: React.ReactElement) {
  cleanup();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(ui);
  });
  return {
    container: container!,
    rerender(next: React.ReactElement) {
      act(() => {
        root?.render(next);
      });
    },
    unmount: cleanup
  };
}

export const screen = {
  getByLabelText(matcher: Matcher) {
    return getByLabelText(ensureContainer(), matcher);
  },
  getByText(matcher: Matcher) {
    return getByText(ensureContainer(), matcher);
  },
  queryByText(matcher: Matcher) {
    return queryByText(ensureContainer(), matcher);
  },
  getByRole(role: string, options?: RoleOptions) {
    return getByRole(ensureContainer(), role, options);
  }
};

function assignValue<T extends HTMLInputElement | HTMLTextAreaElement>(element: T, value: string) {
  Object.defineProperty(element, 'value', {
    configurable: true,
    writable: true,
    value
  });
}

export const fireEvent = {
  click(element: Element) {
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  },
  change(element: HTMLInputElement | HTMLTextAreaElement, options: { target: { value?: string; files?: FileList | null } }) {
    act(() => {
      if (options.target.value !== undefined) {
        assignValue(element, options.target.value);
      }
      if (options.target.files !== undefined) {
        Object.defineProperty(element, 'files', {
          configurable: true,
          value: options.target.files
        });
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  },
  submit(element: HTMLFormElement) {
    act(() => {
      element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }
};

export { cleanup };
