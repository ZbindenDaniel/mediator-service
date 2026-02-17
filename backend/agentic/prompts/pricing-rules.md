<!-- TODO(agent): Refine pricing rules after evaluating price accuracy feedback. -->
# Pricing Rules

- Follow this decision tree in order:
  1. Use `directListingPrice` when a direct listing clearly matches the exact item.
  2. Else use `trustedHistoricalPrice` when sourced from a trusted historical dataset.
  3. Else set `Verkaufspreis` to `null`.
- Do not output `0` unless it is explicitly a valid source value and `zeroIsValid` is set to `true`; otherwise treat zero as missing.
- For any non-null price, provide confidence and evidence:
  - `confidence` between 0 and 1 (or 0-100 which will be normalized).
  - `evidenceCount` as an integer number of distinct supporting signals.
  - Non-null prices require at least 2 evidence signals and confidence >= 0.6.
- Include parse metadata when possible: `sourceUrl` and `parseStatus`.
- If multiple prices conflict, prioritize the direct listing branch above historical fallback.
