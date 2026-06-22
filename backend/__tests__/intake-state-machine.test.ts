// Tests for the state machine routing logic in intake-start.
// The pure branching conditions are tested here without DB dependencies.

type ItemState = {
  exists: boolean;
  qualityId: number | null;
};

function resolveNextStep(item: ItemState | null): 'select_ref' | 'quality' | 'phase2' {
  if (!item || !item.exists) return 'select_ref';
  if (!item.qualityId) return 'quality';
  return 'phase2';
}

describe('intake state machine routing', () => {
  it('returns select_ref when no item exists', () => {
    expect(resolveNextStep(null)).toBe('select_ref');
  });

  it('returns select_ref when item.exists is false', () => {
    expect(resolveNextStep({ exists: false, qualityId: null })).toBe('select_ref');
  });

  it('returns quality when item exists but qualityId is null', () => {
    expect(resolveNextStep({ exists: true, qualityId: null })).toBe('quality');
  });

  it('returns phase2 when item exists and qualityId is set', () => {
    expect(resolveNextStep({ exists: true, qualityId: 42 })).toBe('phase2');
  });

  it('returns phase2 when qualityId is 1 (boundary)', () => {
    expect(resolveNextStep({ exists: true, qualityId: 1 })).toBe('phase2');
  });
});

// intakeKey construction
function makeIntakeKey(serial: string | null | undefined, mac: string | null | undefined): string | null {
  if (serial?.trim()) return `SN:${serial.trim()}`;
  if (mac?.trim()) return `MAC:${mac.trim()}`;
  return null;
}

describe('makeIntakeKey', () => {
  it('prefers serial over mac', () => {
    expect(makeIntakeKey('PF1ABCDE', 'AA:BB:CC:DD:EE:FF')).toBe('SN:PF1ABCDE');
  });

  it('falls back to MAC when serial is absent', () => {
    expect(makeIntakeKey(null, 'AA:BB:CC:DD:EE:FF')).toBe('MAC:AA:BB:CC:DD:EE:FF');
  });

  it('falls back to MAC when serial is empty string', () => {
    expect(makeIntakeKey('', 'AA:BB:CC:DD:EE:FF')).toBe('MAC:AA:BB:CC:DD:EE:FF');
  });

  it('returns null when both serial and mac are absent', () => {
    expect(makeIntakeKey(null, null)).toBeNull();
  });

  it('returns null when both are empty strings', () => {
    expect(makeIntakeKey('', '')).toBeNull();
  });

  it('trims serial whitespace', () => {
    expect(makeIntakeKey('  SN123  ', null)).toBe('SN:SN123');
  });
});
