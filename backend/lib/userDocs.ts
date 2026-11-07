import { FEATURE_KEYS, type FeatureKey } from './features';

// Feature gating for the user help docs (docs/user/*.md). Markers are HTML comments so the files
// still read cleanly as plain Markdown on GitHub/Gitea:
//   <!-- feature: agentic -->          page-level: the whole page needs every listed feature
//   <!-- if-feature: stubs, logs -->   start of a section that needs every listed feature
//   <!-- end-feature -->               end of that section (sections may nest)
// The server strips sections of disabled features *before* sending, so a switched-off feature's
// instructions never reach the browser (same "off means gone" rule as the API gate).

const PAGE_MARKER = /^\s*<!--\s*feature:\s*(.*?)\s*-->\s*$/;
const START_MARKER = /^\s*<!--\s*if-feature:\s*(.*?)\s*-->\s*$/;
const END_MARKER = /^\s*<!--\s*end-feature\s*-->\s*$/;

export type FeatureCheck = (key: FeatureKey) => boolean;

function parseKeys(raw: string): string[] {
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

function isKnown(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}

// Unknown keys count as "off": a typo hides a section instead of leaking a disabled feature's docs.
// `listUnknownDocFeatureKeys` + its test catch typos before they ship.
function allEnabled(keys: string[], isEnabled: FeatureCheck): boolean {
  return keys.every((k) => isKnown(k) && isEnabled(k));
}

/** Features the whole page depends on (page-level `<!-- feature: … -->` markers). */
export function docPageFeatures(markdown: string): string[] {
  const keys: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(PAGE_MARKER);
    if (m) keys.push(...parseKeys(m[1]));
  }
  return keys;
}

export function isDocPageEnabled(markdown: string, isEnabled: FeatureCheck): boolean {
  return allEnabled(docPageFeatures(markdown), isEnabled);
}

/** Removes all markers and the content of sections whose features are off. */
export function filterDocSections(markdown: string, isEnabled: FeatureCheck): string {
  const out: string[] = [];
  const stack: boolean[] = []; // true = this section's own features are on
  for (const line of markdown.split(/\r?\n/)) {
    const start = line.match(START_MARKER);
    if (start) { stack.push(allEnabled(parseKeys(start[1]), isEnabled)); continue; }
    if (END_MARKER.test(line)) { stack.pop(); continue; }
    if (PAGE_MARKER.test(line)) continue;
    if (stack.every(Boolean)) out.push(line);
  }
  // Removed sections leave blank-line runs behind; keep the Markdown tidy.
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Every feature key referenced by markers that isn't a real feature (for tests / lint). */
export function listUnknownDocFeatureKeys(markdown: string): string[] {
  const unknown = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(PAGE_MARKER) ?? line.match(START_MARKER);
    if (!m) continue;
    for (const k of parseKeys(m[1])) if (!isKnown(k)) unknown.add(k);
  }
  return [...unknown];
}

/** True when every `if-feature` has a matching `end-feature`. */
export function hasBalancedDocSections(markdown: string): boolean {
  let depth = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (START_MARKER.test(line)) depth += 1;
    else if (END_MARKER.test(line)) { depth -= 1; if (depth < 0) return false; }
  }
  return depth === 0;
}

/** Numeric file prefix ("10_KI-Cockpit" → 10); readdir order is not guaranteed and "10_" < "2_" as text. */
export function compareDocNames(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}
