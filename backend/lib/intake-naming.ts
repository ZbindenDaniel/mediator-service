// Naming/matching helpers for the device-intake flow.
//
// The netboot intake image reports the manufacturer both as a separate `vendor`
// field AND embedded in `model` (e.g. vendor="HP", model="HP HP ProBook 470 G4"),
// so a naive `[vendor, model].join(' ')` produced triplicated brands
// ("HP HP HP ProBook 470 G4") and a substring match on the doubled model missed
// clean catalog descriptions. These helpers strip the redundant leading vendor.

/**
 * Remove one-or-more leading occurrences of `vendor` from `model`
 * (case-insensitive, whitespace-tolerant). Returns the trimmed model unchanged
 * when `vendor` is empty or not a leading token.
 *
 * stripLeadingVendor("HP HP ProBook 470 G4", "HP") === "ProBook 470 G4"
 * stripLeadingVendor("ProBook 470 G4", "HP")       === "ProBook 470 G4"
 * stripLeadingVendor("HP ProBook", "")             === "HP ProBook"
 */
export function stripLeadingVendor(model: string | null | undefined, vendor: string | null | undefined): string {
  let m = (model ?? '').trim();
  const v = (vendor ?? '').trim();
  if (!v) return m;
  const vLower = v.toLowerCase();
  // Strip repeatedly so a doubled prefix ("HP HP …") collapses fully.
  while (m.toLowerCase().startsWith(vLower)) {
    const rest = m.slice(v.length);
    // Only treat it as a leading token if the brand is followed by whitespace
    // (or is the whole string) — avoids eating "HP" out of "HProBook".
    if (rest.length > 0 && !/^\s/.test(rest)) break;
    m = rest.trimStart();
  }
  return m;
}

/**
 * Compose a reference display name carrying the brand exactly once:
 * `<vendor> <model-without-leading-vendor>`.
 *
 * composeRefName("HP", "HP HP ProBook 470 G4") === "HP ProBook 470 G4"
 */
export function composeRefName(vendor: string | null | undefined, model: string | null | undefined): string {
  const v = (vendor ?? '').trim();
  const cleanModel = stripLeadingVendor(model, v);
  return [v, cleanModel].filter(Boolean).join(' ');
}
