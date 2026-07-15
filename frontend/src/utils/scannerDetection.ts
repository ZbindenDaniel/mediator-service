// Hardware barcode scanners (keyboard-wedge devices) "type" the scanned characters
// into the focused input at machine speed and then emit a trailing Enter. That Enter
// would submit the focused form. This pure state machine detects such a scan by keystroke
// timing so the caller can cancel ONLY the scanner's Enter, leaving human Enter-to-submit
// intact. Kept DOM-free here so the detection logic is unit-testable in isolation.

export interface ScanDetectorOptions {
  // Max gap (ms) between keystrokes to still count as one machine-fast burst.
  // Wedge scanners are typically <10ms/key; humans are >100ms/key, so 30ms is a safe ceiling.
  fastKeyThresholdMs?: number;
  // Minimum fast printable characters that must precede an Enter before it counts as a scan.
  // Guards against a 1-2 char human keypress being mistaken for a scan.
  minScanLength?: number;
}

export interface ScanDetector {
  // Returns true only when `key` is the terminating Enter of a fast scan burst, signalling
  // the caller to suppress it. All other keys return false.
  observe(key: string, timeStampMs: number, isRepeat?: boolean): boolean;
}

const DEFAULT_FAST_KEY_THRESHOLD_MS = 30;
const DEFAULT_MIN_SCAN_LENGTH = 3;

export function createScanDetector(opts: ScanDetectorOptions = {}): ScanDetector {
  const threshold = opts.fastKeyThresholdMs ?? DEFAULT_FAST_KEY_THRESHOLD_MS;
  const minLength = opts.minScanLength ?? DEFAULT_MIN_SCAN_LENGTH;

  let lastTimeMs = 0;
  let fastRun = 0;

  return {
    observe(key: string, timeStampMs: number, isRepeat = false): boolean {
      const gap = timeStampMs - lastTimeMs;

      if (key === 'Enter') {
        // A scan's Enter arrives immediately after the last char of a fast burst.
        const isScanEnter = fastRun >= minLength && gap < threshold;
        lastTimeMs = timeStampMs;
        fastRun = 0;
        return isScanEnter;
      }

      // Auto-repeat (held key) is never a scan; ignore it entirely without disturbing state.
      if (isRepeat) {
        return false;
      }

      // Only printable single-character keys make up a barcode payload. Modifier and
      // navigation keys (Shift, Arrow*, Tab, ...) are left untouched so a scanner emitting
      // Shift for an uppercase char does not reset an in-progress burst.
      if (key.length === 1) {
        if (gap < threshold) {
          fastRun += 1;
        } else {
          fastRun = 1; // start of a potential new burst
        }
        lastTimeMs = timeStampMs;
      }

      return false;
    }
  };
}
