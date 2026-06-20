// harness-utils.test.ts was testing Jest internals; replaced with tests for
// shared utility functions used across the test harness.
import { resolveEventLogLevel } from '../models';

describe('resolveEventLogLevel utility (used by event insert harness)', () => {
  it('returns Important for high-signal events', () => {
    expect(resolveEventLogLevel('Moved')).toBe('Important');
    expect(resolveEventLogLevel('Deleted')).toBe('Important');
  });

  it('returns Information for routine events', () => {
    expect(resolveEventLogLevel('Created')).toBe('Information');
    expect(resolveEventLogLevel('AgenticRunRestarted')).toBe('Information');
  });

  // EVENT_DEFAULT_LEVEL = 'error', so unrecognized keys map to Error (not Information)
  it('returns Error as the default for unrecognized event keys', () => {
    expect(resolveEventLogLevel('UnknownEvent')).toBe('Error');
    expect(resolveEventLogLevel('')).toBe('Error');
  });
});
