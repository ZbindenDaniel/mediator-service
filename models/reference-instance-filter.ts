// Deterministic backstop for the ref/instance boundary (prevention prompts leak — the model keeps
// putting installed RAM/disk into the reference). The reference describes the MODEL, so a *fitted*
// "8 GB RAM" / "256 GB SSD" is per-unit (instance) data that doesn't belong. Two SAFE strips — a name
// (token list) and spec keys; prose (Kurzbeschreibung) is left to the wording pass because removing a
// size from a sentence ("… mit 8 GB RAM und …") mangles grammar. CALL ONLY for slotted compute devices
// (an assembly with a ram/storage slot); never for RAM-module / drive products, where it is the spec.

// Installed-value concepts, matched as WHOLE WORDS so variants are caught without enumerating them:
// "HardDrive", "Festplattenkapazität", "Arbeitsspeicher (RAM)", "RAM-Größe", "Massenspeicher", "OS".
// An exact denylist was too brittle (it missed "hardDrive"). This is the robust form of the operator's
// "anti-value" idea: the concept, not the exact string.
// German stems are matched as substrings (compounds like "Festplattenkapazität"/"Speichergröße" must
// match); short/ambiguous tokens keep word boundaries so they don't hit unrelated keys ("os" in
// "Kosten", "ram" in "Programm"). CAPABILITY_FIELD + the contract-field guard protect the legit cases.
const INSTALLED_CONCEPT = /festplatte|arbeitsspeicher|hauptspeicher|massenspeicher|speicher|betriebssystem|hard\s?drive|operating\s?system|\b(?:ram|hdd|sshd|ssd|nvme|emmc|memory|storage|os)\b/i;
// Capability field names describe the MODEL (slots / max / type), never a fitted value — never dropped,
// even though they contain an installed word ("RAM-Kapazität" contains "RAM").
const CAPABILITY_FIELD = /^(?:ram-slots|ram-kapazität|ram-kapazitaet|ram-typ|speichertyp|formfaktor)$/i;

/**
 * Drops installed-value spec keys from a reference Langtext record. A key is dropped when it denotes an
 * installed RAM/disk/OS concept AND the subcategory's spec contract does NOT define it (the contract is
 * the authority on what specs belong — so a drive's "Speicher" or a RAM module's "RAM-Kapazität", which
 * ARE their contract fields, are kept) AND it is not a capability field name. Pass the contract's field
 * keys so product-spec fields survive on module/drive subcategories.
 */
export function dropInstanceSpecKeys<T = unknown>(
  langtext: Record<string, T>,
  contractFieldKeys: Iterable<string> = []
): Record<string, T> {
  const allowed = new Set(Array.from(contractFieldKeys, (k) => k.trim().toLowerCase()));
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(langtext)) {
    const lower = key.trim().toLowerCase();
    const drop = INSTALLED_CONCEPT.test(key) && !allowed.has(lower) && !CAPABILITY_FIELD.test(lower);
    if (!drop) out[key] = value;
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
