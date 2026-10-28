import { partItemUUIDStem, nextPartItemUUID, parseSequentialItemUUID } from '../itemIds';
import { isUsableSerial } from '../component-serial';

describe('part ID scheme (C-<root>-<subcategory>-<####>)', () => {
  test('stem names root device and subcategory', () => {
    expect(partItemUUIDStem('104523', 2132)).toBe('C-104523-2132-');
    expect(partItemUUIDStem(' 104523 ', 603)).toBe('C-104523-603-');
  });

  test('unknown subcategory gets the 0 segment', () => {
    expect(partItemUUIDStem('104523', null)).toBe('C-104523-0-');
    expect(partItemUUIDStem('104523', Number.NaN)).toBe('C-104523-0-');
  });

  test('refuses a root that would make the stem ambiguous', () => {
    expect(() => partItemUUIDStem('', 2132)).toThrow();
    expect(() => partItemUUIDStem('10-45', 2132)).toThrow();
    expect(() => partItemUUIDStem('10%45', 2132)).toThrow();
    expect(() => partItemUUIDStem('10_45', 2132)).toThrow();
  });

  test('counts up from the latest ID of the same stem', () => {
    const stem = 'C-104523-2132-';
    expect(nextPartItemUUID(stem, null)).toBe('C-104523-2132-0001');
    expect(nextPartItemUUID(stem, 'C-104523-2132-0007')).toBe('C-104523-2132-0008');
    expect(nextPartItemUUID(stem, 'C-104523-2132-9999')).toBe('C-104523-2132-10000');
    // A foreign or legacy random ID never feeds the counter.
    expect(nextPartItemUUID(stem, 'C-mgx3k2a0f4z1q')).toBe('C-104523-2132-0001');
  });

  test('parseSequentialItemUUID does not read an Artikelnummer out of a part ID', () => {
    expect(parseSequentialItemUUID('C-104523-2132-0003')).toBeNull();
    expect(parseSequentialItemUUID('C-104523-2132-0003', null)).toBeNull();
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
