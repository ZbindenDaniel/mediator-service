// Deterministic backstop for the ref/instance boundary (prevention prompts leak — the model keeps
// putting installed RAM/disk into the reference). The reference describes the MODEL, so a *fitted*
// "8 GB RAM" / "256 GB SSD" is per-unit (instance) data that doesn't belong. Two SAFE strips — a name
// (token list) and spec keys; prose (Kurzbeschreibung) is left to the wording pass because removing a
// size from a sentence ("… mit 8 GB RAM und …") mangles grammar. CALL ONLY for slotted compute devices
// (an assembly with a ram/storage slot); never for RAM-module / drive products, where it is the spec.

// Bare installed-value keys. Capability keys stay because they are NOT bare: "RAM-Slots",
// "RAM-Kapazität", "RAM-Typ", "Speichertyp" lowercase to something not in this set (exact match).
const INSTANCE_SPEC_KEYS = new Set([
  'ram', 'arbeitsspeicher', 'memory', 'hauptspeicher',
  'speicher', 'festplatte', 'ssd', 'hdd', 'storage', 'speicherkapazität',
  // OS is per-unit on a used device (reinstalled/varies), so the installed OS doesn't belong in the
  // model reference's spec list either. (Prose OS mentions are still the wording pass's job.)
  'betriebssystem', 'os', 'operating system', 'betriebssystem (os)'
]);

/** Drops bare installed-value spec keys from a reference Langtext record; capability keys pass through. */
export function dropInstanceSpecKeys<T = unknown>(langtext: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(langtext)) {
    if (INSTANCE_SPEC_KEYS.has(key.trim().toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

const MEM_COMPONENT = 'RAM|Arbeitsspeicher|Memory|SSD|HDD|SSHD|NVMe|eMMC|Festplatte|Speicher|Storage|DDR\\d?L?';
const SIZE = String.raw`\d+(?:[.,]\d+)?\s?(?:GB|TB|MB)`;
// "<size> [DDRx] <component>"  OR  "<component>[: ] <size>"
const INSTALLED_SIZE_PHRASE = new RegExp(
  String.raw`\b(?:${SIZE}[\s-]?(?:DDR\d?L?[\s-]?)?(?:${MEM_COMPONENT})|(?:${MEM_COMPONENT})[\s:-]{0,2}${SIZE})\b`,
  'gi'
);

/**
 * Removes installed memory/storage SIZE phrases from a product NAME (Artikelbeschreibung). Safe because
 * a name is a token list, not a sentence — after removal we only tidy whitespace and drop a dangling
 * trailing separator/connector. Bare mentions without a size ("mit SSD") are left untouched.
 */
export function stripInstalledSizesFromName(name: string): string {
  if (!name) return name;
  let out = name.replace(INSTALLED_SIZE_PHRASE, ' ');
  out = out
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\s+(?:mit|und|with|and)$/i, '') // dangling connector left by a removed trailing phrase
    .replace(/[\s,;/|–-]+$/g, '')             // trailing separators
    .replace(/^[\s,;/|–-]+/g, '')             // leading separators
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out;
}
