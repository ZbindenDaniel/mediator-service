<!-- TODO(agent): Refine pricing rules after evaluating price accuracy feedback. -->
# Pricing Rules

- Prefer a realistic Verkaufspreis that matches typical used-market pricing signals.
- When a source shows a price range, choose a conservative midpoint within the range.
- Avoid inventing prices without a concrete signal; return null instead.
- Output numeric values only (no currency symbols or textual qualifiers).
- If multiple prices conflict, prefer the most recent or most specific item match.
