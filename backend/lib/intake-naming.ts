// Naming helper for the device-intake flow.
//
// The netboot intake image embeds the manufacturer inside `model` (e.g.
// vendor="HP", model="HP HP ProBook 470 G4"), and the old name builder also
// prepended `Hersteller`, so a new reference ended up as "HP HP HP ProBook…".
// We no longer prepend the vendor; we only collapse the accidental repeated
// tokens so the brand the scan already carries appears exactly once.

/**
 * Collapse consecutive duplicate whitespace-separated tokens (case-insensitive),
 * keeping the first occurrence's casing. Used to remove the brand duplication the
 * intake scan/name-composition introduces without stripping a brand that is
 * legitimately part of the model name.
 *
 * collapseRepeatedTokens("HP HP HP ProBook 470 G4") === "HP ProBook 470 G4"
 * collapseRepeatedTokens("ProBook 470 G4")          === "ProBook 470 G4"
 */
export function collapseRepeatedTokens(text: string | null | undefined): string {
  const parts = (text ?? '').trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (!out.length || out[out.length - 1].toLowerCase() !== p.toLowerCase()) {
      out.push(p);
    }
  }
  return out.join(' ');
}
