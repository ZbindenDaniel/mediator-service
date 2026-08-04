import { generateComponentUUID, isComponentUUID, parseSequentialItemUUID } from '../itemIds';
import { isUsableSerial } from '../component-serial';

describe('component UUID scheme', () => {
  test('mints a C- prefixed id', () => {
    const uuid = generateComponentUUID(() => 0.5);
    expect(uuid.startsWith('C-')).toBe(true);
    expect(isComponentUUID(uuid)).toBe(true);
  });

  test('successive mints are unique', () => {
    const a = generateComponentUUID(() => 0.11);
    const b = generateComponentUUID(() => 0.99);
    expect(a).not.toBe(b);
  });

  test('isComponentUUID is false for normal and empty ids', () => {
    expect(isComponentUUID('I-12345-0001')).toBe(false);
    expect(isComponentUUID('')).toBe(false);
    expect(isComponentUUID(null)).toBe(false);
    expect(isComponentUUID(undefined)).toBe(false);
  });

  test('parseSequentialItemUUID degrades to null for a component id (no mis-derived Artikelnummer)', () => {
    const uuid = generateComponentUUID(() => 0.42);
    expect(parseSequentialItemUUID(uuid)).toBeNull();
    // Even if someone passes the component prefix explicitly, there is no Artikelnummer to read.
    expect(parseSequentialItemUUID(uuid, 'C-')).toBeNull();
  });
});

describe('serial hardening', () => {
  test('accepts real serials', () => {
    expect(isUsableSerial('S3Z9NX0M12345')).toBe(true);
    expect(isUsableSerial('PF1ABCDE')).toBe(true);
  });

  test('rejects blanks and whitespace', () => {
    expect(isUsableSerial('')).toBe(false);
    expect(isUsableSerial('   ')).toBe(false);
    expect(isUsableSerial(null)).toBe(false);
    expect(isUsableSerial(undefined)).toBe(false);
  });

  test('rejects known SMBIOS/firmware placeholders (case-insensitive)', () => {
    expect(isUsableSerial('Default string')).toBe(false);
    expect(isUsableSerial('DEFAULT STRING')).toBe(false);
    expect(isUsableSerial('To be filled by O.E.M.')).toBe(false);
    expect(isUsableSerial('System Serial Number')).toBe(false);
    expect(isUsableSerial('None')).toBe(false);
    expect(isUsableSerial('n/a')).toBe(false);
  });

  test('rejects single-character fillers', () => {
    expect(isUsableSerial('0000000')).toBe(false);
    expect(isUsableSerial('.....')).toBe(false);
    expect(isUsableSerial('-')).toBe(false);
  });
});
