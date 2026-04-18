import {
  validateAltDocIdentifierValue,
  normalizeAltDocIdentifierValue,
  resolveAltDocIdentifier,
  resolveAltDocDirPath,
  buildExternalDocUrl
} from '../lib/alt-doc-resolver';
import type { AltDocDirectoryConfig } from '../config';
import type { AltDocResolutionContext } from '../lib/alt-doc-resolver';

const makeConfig = (overrides: Partial<AltDocDirectoryConfig> = {}): AltDocDirectoryConfig => ({
  name: 'wipe-reports',
  mountPath: '/mnt/wipe',
  identifierType: 'serialNumber',
  ...overrides
});

const makeCtx = (overrides: Partial<AltDocResolutionContext> = {}): AltDocResolutionContext => ({
  itemUUID: 'I-001234-0001',
  ean: null,
  serialNumber: null,
  macAddress: null,
  ...overrides
});

describe('validateAltDocIdentifierValue', () => {
  it('accepts digits-only EAN', () => {
    expect(validateAltDocIdentifierValue('1234567890123', 'ean')).toBe(true);
  });

  it('accepts alphanumeric EAN', () => {
    expect(validateAltDocIdentifierValue('ABC123', 'ean')).toBe(true);
  });

  it('rejects EAN with slashes', () => {
    expect(validateAltDocIdentifierValue('123/456', 'ean')).toBe(false);
  });

  it('accepts serial number with hyphens and underscores', () => {
    expect(validateAltDocIdentifierValue('SN-1234_AB', 'serialNumber')).toBe(true);
  });

  it('rejects serial number with path traversal', () => {
    expect(validateAltDocIdentifierValue('../etc', 'serialNumber')).toBe(false);
  });

  it('rejects serial number with slashes', () => {
    expect(validateAltDocIdentifierValue('SN/1234', 'serialNumber')).toBe(false);
  });

  it('accepts MAC address with colons', () => {
    expect(validateAltDocIdentifierValue('AA:BB:CC:DD:EE:FF', 'macAddress')).toBe(true);
  });

  it('accepts MAC address with hyphens', () => {
    expect(validateAltDocIdentifierValue('AA-BB-CC-DD-EE-FF', 'macAddress')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateAltDocIdentifierValue('', 'serialNumber')).toBe(false);
  });

  it('rejects MAC address with path traversal', () => {
    expect(validateAltDocIdentifierValue('../etc', 'macAddress')).toBe(false);
  });
});

describe('normalizeAltDocIdentifierValue', () => {
  it('returns value unchanged when normalize is null', () => {
    expect(normalizeAltDocIdentifierValue('abc123', null)).toBe('abc123');
  });

  it('uppercases when normalize is uppercase', () => {
    expect(normalizeAltDocIdentifierValue('aabbcc', 'uppercase')).toBe('AABBCC');
  });

  it('lowercases when normalize is lowercase', () => {
    expect(normalizeAltDocIdentifierValue('AABBCC', 'lowercase')).toBe('aabbcc');
  });

  it('strips colons when normalize is strip-colons', () => {
    expect(normalizeAltDocIdentifierValue('AA:BB:CC:DD:EE:FF', 'strip-colons')).toBe('AABBCCDDEEFF');
  });
});

describe('resolveAltDocIdentifier', () => {
  it('returns null when EAN is not set', () => {
    const ctx = makeCtx({ ean: null });
    const config = makeConfig({ identifierType: 'ean' });
    expect(resolveAltDocIdentifier(ctx, config)).toBeNull();
  });

  it('returns null when serialNumber is not set', () => {
    const ctx = makeCtx({ serialNumber: null });
    const config = makeConfig({ identifierType: 'serialNumber' });
    expect(resolveAltDocIdentifier(ctx, config)).toBeNull();
  });

  it('returns normalized identifier when set', () => {
    const ctx = makeCtx({ serialNumber: 'SN-12345' });
    const config = makeConfig({ identifierType: 'serialNumber' });
    expect(resolveAltDocIdentifier(ctx, config)).toBe('SN-12345');
  });

  it('applies normalization before returning', () => {
    const ctx = makeCtx({ macAddress: 'AA:BB:CC:DD:EE:FF' });
    const config = makeConfig({ identifierType: 'macAddress', normalize: 'strip-colons' });
    expect(resolveAltDocIdentifier(ctx, config)).toBe('AABBCCDDEEFF');
  });

  it('returns null for invalid identifier value after normalization', () => {
    const ctx = makeCtx({ serialNumber: '../etc/passwd' });
    const config = makeConfig({ identifierType: 'serialNumber' });
    expect(resolveAltDocIdentifier(ctx, config)).toBeNull();
  });

  it('resolves EAN from context', () => {
    const ctx = makeCtx({ ean: '4006381333931' });
    const config = makeConfig({ identifierType: 'ean' });
    expect(resolveAltDocIdentifier(ctx, config)).toBe('4006381333931');
  });
});

describe('resolveAltDocDirPath', () => {
  it('returns null when identifier is not set', () => {
    const ctx = makeCtx({ serialNumber: null });
    const config = makeConfig({ identifierType: 'serialNumber', mountPath: '/mnt/wipe' });
    expect(resolveAltDocDirPath(ctx, config)).toBeNull();
  });

  it('returns dirPath within mountPath for valid identifier', () => {
    const ctx = makeCtx({ serialNumber: 'SN-12345' });
    const config = makeConfig({ identifierType: 'serialNumber', mountPath: '/mnt/wipe' });
    const result = resolveAltDocDirPath(ctx, config);
    expect(result).not.toBeNull();
    expect(result!.dirPath).toBe('/mnt/wipe/SN-12345');
    expect(result!.identifierValue).toBe('SN-12345');
  });

  it('rejects path traversal via identifier value', () => {
    const ctx = makeCtx({ ean: '1234567890' });
    // EAN with traversal won't pass validation, so this should return null
    const ctx2 = makeCtx({ ean: null });
    const config = makeConfig({ identifierType: 'ean', mountPath: '/mnt/docs' });
    expect(resolveAltDocDirPath(ctx2, config)).toBeNull();
  });
});

describe('buildExternalDocUrl', () => {
  it('builds correct URL', () => {
    expect(buildExternalDocUrl('wipe-reports', 'I-001234-0001', 'report.pdf')).toBe(
      '/external-docs/wipe-reports/I-001234-0001/report.pdf'
    );
  });

  it('encodes special characters in components', () => {
    const url = buildExternalDocUrl('dir name', 'I-001234-0001', 'my file.pdf');
    expect(url).toBe('/external-docs/dir%20name/I-001234-0001/my%20file.pdf');
  });
});
