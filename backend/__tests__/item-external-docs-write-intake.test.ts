// Tests for the SN:/MAC: prefix branch in item-external-docs-write.
// These cover the pure parsing/resolution logic without making HTTP requests.

import { resolveAltDocDirPath } from '../lib/alt-doc-resolver';
import type { AltDocDirectoryConfig } from '../config';

const makeConfig = (overrides: Partial<AltDocDirectoryConfig> = {}): AltDocDirectoryConfig => ({
  name: 'intake-scans',
  mountPath: '/mnt/intake',
  identifierType: 'serialNumber',
  writable: true,
  ...overrides,
} as AltDocDirectoryConfig);

function parseIntakeKey(itemUUID: string): { serialNumber: string | null; macAddress: string | null } | null {
  if (itemUUID.startsWith('SN:')) {
    return { serialNumber: itemUUID.slice(3), macAddress: null };
  }
  if (itemUUID.startsWith('MAC:')) {
    return { serialNumber: null, macAddress: itemUUID.slice(4) };
  }
  return null;
}

function buildCtxFromPrefix(itemUUID: string) {
  const parsed = parseIntakeKey(itemUUID);
  if (!parsed) return null;
  return {
    itemUUID,
    ean: null,
    serialNumber: parsed.serialNumber,
    macAddress: parsed.macAddress,
  };
}

describe('SN:/MAC: prefix parsing', () => {
  it('detects SN: prefix and extracts serial', () => {
    const ctx = buildCtxFromPrefix('SN:PF1ABCDE');
    expect(ctx).not.toBeNull();
    expect(ctx!.serialNumber).toBe('PF1ABCDE');
    expect(ctx!.macAddress).toBeNull();
  });

  it('detects MAC: prefix and extracts mac', () => {
    const ctx = buildCtxFromPrefix('MAC:AA:BB:CC:DD:EE:FF');
    expect(ctx).not.toBeNull();
    expect(ctx!.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(ctx!.serialNumber).toBeNull();
  });

  it('returns null for plain itemUUID', () => {
    expect(buildCtxFromPrefix('I-001234-0001')).toBeNull();
  });
});

describe('alt-doc path resolution with SN: prefix', () => {
  it('resolves dirPath from serial under mountPath', () => {
    const ctx = buildCtxFromPrefix('SN:PF1ABCDE')!;
    const config = makeConfig({ mountPath: '/mnt/intake', identifierType: 'serialNumber' });
    const result = resolveAltDocDirPath(ctx, config);
    expect(result).not.toBeNull();
    expect(result!.dirPath).toBe('/mnt/intake/PF1ABCDE');
    expect(result!.identifierValue).toBe('PF1ABCDE');
  });

  it('resolves dirPath from mac under mountPath', () => {
    const ctx = buildCtxFromPrefix('MAC:AABBCCDDEEFF')!;
    const config = makeConfig({ mountPath: '/mnt/intake', identifierType: 'macAddress' });
    const result = resolveAltDocDirPath(ctx, config);
    expect(result).not.toBeNull();
    expect(result!.dirPath).toBe('/mnt/intake/AABBCCDDEEFF');
  });

  it('rejects path traversal via SN: prefix', () => {
    // ../etc/passwd would fail the serialNumber validation pattern
    const ctx = buildCtxFromPrefix('SN:../etc/passwd')!;
    const config = makeConfig({ mountPath: '/mnt/intake', identifierType: 'serialNumber' });
    const result = resolveAltDocDirPath(ctx, config);
    expect(result).toBeNull();
  });

  it('returns null when identifierType does not match prefix type', () => {
    // Serial in context but config wants mac
    const ctx = buildCtxFromPrefix('SN:PF1ABCDE')!;
    const config = makeConfig({ mountPath: '/mnt/intake', identifierType: 'macAddress' });
    const result = resolveAltDocDirPath(ctx, config);
    expect(result).toBeNull();
  });
});
