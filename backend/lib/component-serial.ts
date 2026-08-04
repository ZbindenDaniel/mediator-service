// Serial-number hardening shared by device and component intake.
//
// BIOS/SMBIOS and cheap drive firmware frequently report placeholder serials instead of a
// real one. These are unusable as an identity/report key: many distinct devices report the
// SAME placeholder, so keying on them would collapse unrelated units onto one identity and
// mis-route reports. We reject them up front and treat the serial as absent.

// Case-insensitive exact-match placeholders seen in the field (SMBIOS defaults + common
// firmware fillers). Compared after trimming and l-casing.
const PLACEHOLDER_SERIALS = new Set([
  '',
  '0',
  '00000000',
  'none',
  'n/a',
  'na',
  'null',
  'default string',
  'to be filled by o.e.m.',
  'to be filled by o.e.m',
  'system serial number',
  'serial number',
  'not specified',
  'not applicable',
  'unknown',
  'invalid',
  'xxxxxxx',
  'oem',
]);

/**
 * True when `serial` is a real, usable identity/report key — non-blank and not a known
 * placeholder. Use this before creating an item/component from a scanned serial or before
 * uploading a report under SN:<serial>/.
 */
export function isUsableSerial(serial: string | null | undefined): boolean {
  if (typeof serial !== 'string') return false;
  const normalized = serial.trim().toLowerCase();
  if (!normalized) return false;
  if (PLACEHOLDER_SERIALS.has(normalized)) return false;
  // Strings of a single repeated char (e.g. "0000", "....", "----") are firmware fillers.
  if (/^(.)\1*$/.test(normalized)) return false;
  return true;
}

export const __TESTING__ = { PLACEHOLDER_SERIALS };
