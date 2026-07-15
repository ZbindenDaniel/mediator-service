import { createScanDetector } from '../scannerDetection';

// Helper: feed a printable string as a fast machine-speed burst, then an Enter, and
// return whether the detector flagged the Enter for suppression.
function feed(
  detector: ReturnType<typeof createScanDetector>,
  chars: string,
  gapMs: number,
  startMs = 1000
): boolean {
  let t = startMs;
  for (const ch of chars) {
    detector.observe(ch, t);
    t += gapMs;
  }
  return detector.observe('Enter', t);
}

describe('createScanDetector', () => {
  it('suppresses the trailing Enter of a fast scan burst', () => {
    const detector = createScanDetector();
    // 12-char barcode at 5ms/key (well under the 30ms threshold) → scanner.
    expect(feed(detector, '400638133393', 5)).toBe(true);
  });

  it('allows Enter after slow human typing', () => {
    const detector = createScanDetector();
    // 150ms/key is human speed → Enter must pass through and submit.
    expect(feed(detector, '400638133393', 150)).toBe(false);
  });

  it('allows Enter when fewer than minScanLength fast chars precede it', () => {
    const detector = createScanDetector();
    // Only 2 fast chars — below the default minScanLength of 3 → not a scan.
    expect(feed(detector, 'ab', 5)).toBe(false);
  });

  it('allows Enter that arrives slowly after a fast burst', () => {
    const detector = createScanDetector();
    let t = 1000;
    for (const ch of 'ABCDEF') {
      detector.observe(ch, t);
      t += 5;
    }
    // Operator pauses, then presses Enter deliberately 500ms later → should submit.
    expect(detector.observe('Enter', t + 500)).toBe(false);
  });

  it('does not count auto-repeat keys toward the burst', () => {
    const detector = createScanDetector();
    let t = 1000;
    // A single held key auto-repeating fast, then Enter — not a scan.
    for (let i = 0; i < 6; i += 1) {
      detector.observe('x', t, true);
      t += 5;
    }
    expect(detector.observe('Enter', t)).toBe(false);
  });

  it('ignores modifier keys between characters without breaking the burst', () => {
    const detector = createScanDetector();
    let t = 1000;
    // Scanner emits Shift before an uppercase char; the Shift must not reset the run.
    const sequence: Array<[string, boolean]> = [
      ['a', false],
      ['b', false],
      ['Shift', false],
      ['C', false],
      ['d', false]
    ];
    for (const [key] of sequence) {
      detector.observe(key, t);
      t += 5;
    }
    expect(detector.observe('Enter', t)).toBe(true);
  });

  it('resets between two separate scans', () => {
    const detector = createScanDetector();
    expect(feed(detector, '111222333', 5, 1000)).toBe(true);
    // A later, independent human Enter far in the future must not be suppressed.
    expect(detector.observe('Enter', 100000)).toBe(false);
  });

  it('honours custom thresholds', () => {
    const detector = createScanDetector({ fastKeyThresholdMs: 10, minScanLength: 5 });
    // 8ms/key is under the 10ms threshold, but only 4 chars < minScanLength 5.
    expect(feed(detector, '1234', 8)).toBe(false);
    const detector2 = createScanDetector({ fastKeyThresholdMs: 10, minScanLength: 5 });
    expect(feed(detector2, '12345', 8)).toBe(true);
  });
});
