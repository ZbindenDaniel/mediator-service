/** @jest-environment jsdom */

import { createScanDetector } from '../scannerDetection';

// Integration check: mirrors the capture-phase keydown guard wired in App.tsx, driving real
// DOM KeyboardEvents. Proves that a scanner's trailing Enter is cancelled and stopped from
// reaching a downstream input Enter handler (the concrete "scan triggers an action" path used
// by e.g. AddItemToBoxDialog/BoxSearchInput), while a human-speed Enter reaches it untouched.

function installGuard(): () => void {
  const detector = createScanDetector();
  const onKeyDown = (event: KeyboardEvent) => {
    if (detector.observe(event.key, event.timeStamp, event.repeat)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}

function keydown(target: EventTarget, key: string, timeStampMs: number): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  // jsdom sets timeStamp at construction; override it so we control inter-key timing.
  Object.defineProperty(event, 'timeStamp', { value: timeStampMs });
  target.dispatchEvent(event);
  return event;
}

describe('scanner guard (DOM capture phase)', () => {
  let uninstall: () => void;
  let input: HTMLInputElement;
  let enterHandler: jest.Mock;

  beforeEach(() => {
    uninstall = installGuard();
    input = document.createElement('input');
    document.body.appendChild(input);
    enterHandler = jest.fn();
    // A downstream Enter action handler on the input (bubble phase), like the app's search inputs.
    input.addEventListener('keydown', (event: Event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        enterHandler();
      }
    });
  });

  afterEach(() => {
    uninstall();
    input.remove();
  });

  it("blocks a scan's Enter from reaching the input handler", () => {
    let t = 500;
    for (const ch of 'X100200300') {
      keydown(input, ch, t);
      t += 5;
    }
    const enterEvent = keydown(input, 'Enter', t);
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(enterHandler).not.toHaveBeenCalled();
  });

  it('lets a human Enter reach the input handler', () => {
    let t = 500;
    for (const ch of 'X100200300') {
      keydown(input, ch, t);
      t += 150;
    }
    const enterEvent = keydown(input, 'Enter', t + 150);
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(enterHandler).toHaveBeenCalledTimes(1);
  });
});
