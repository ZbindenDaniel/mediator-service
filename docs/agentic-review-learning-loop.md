# Agentic Review Learning Loop Plan

## Objective & Motivation

Build a structured review-learning loop for the agentic flow so reviewer feedback improves future runs automatically per application instance.

- **Primary goal:** reduce repeated review corrections and improve first-pass output quality.
- **Secondary goal:** keep implementation minimal by extending existing run metadata, prompt assembly, and flow orchestration rather than adding parallel systems.
- **Scope:** current behavior only.

## Current State (Baseline)

Today, review metadata persists `decision`, `notes`, `reviewedBy`, and `state`, and normalized `reviewNotes` are forwarded into invocation/flow context. There is currently no finalized influence map or structured trigger system for prompt injection.

## Confirmed Decisions

1. Learning is **global per application instance**.
2. Aggregation is done by **subcategory**.
3. Review input becomes a **structured form** plus optional notes.
4. Prompt examples should use **real reviewed items** instead of hardcoded samples.
5. Prompt updates remain **human-in-the-loop**.

## Review Input Model (updated)

### Structured fields

- `information_present: boolean | null`
  - Meaning: **"Enough data is present, no required fields seem to miss."**
- `missing_spec: string[]`
  - Meaning: **"These fields should be prioritized to research."**
- `bad_format: boolean | null`
  - Signals schema/format quality problems.
- `wrong_information: boolean | null`
  - Signals factual correctness issues.
- `wrong_physical_dimensions: boolean | null`
  - Signals dimension/unit plausibility or format problems.

### Notes coexistence

- Keep `notes` as an open channel for uncaught reviewer signals.
- Inject notes only through strict sanitization and length limits.

## Existing Prompt Abstraction (already in place)

We should reuse existing structures instead of adding a new prompt subsystem:

- `backend/agentic/flow/prompts.ts::loadPrompts()` loads the prompt bundle used by item flow.
- `backend/agentic/flow/prompts.ts::loadChatPrompt()` already performs template token replacement and validation using `{{ITEM_DATABASE_SCHEMA}}`.
- `backend/agentic/flow/item-flow-extraction.ts` already builds dynamic context sections before `llm.invoke`.

Conclusion: prompt abstraction already exists; we extend it with additional placeholders and one injection resolver.

## Placeholder Injection Contract (proposed)

Use the existing placeholder style (`{{TOKEN_NAME}}`) for consistency:

- `{{CATEGORIZER_REVIEW}}`
- `{{EXTRACTION_REVIEW}}`
- `{{SUPERVISOR_REVIEW}}`
- `{{EXAMPLE_ITEM}}`

### Resolver shape

- Build one typed `PromptInjectionContext` from:
  - current structured review,
  - last-10 reviewed items aggregate for same subcategory,
  - optional example item.
- Resolve placeholders through one helper and deterministic fallbacks.
- Use per-placeholder fragment arrays (`Map<placeholder, string[]>`) and join-at-end assembly so multiple triggers can append text to the same placeholder safely.

Pseudo pattern:

- `InjectConditionally(condition, placeholder, injectedText)`

This allows:

- same condition injecting into multiple prompts,
- same condition injecting multiple fragments into the same prompt,
- different triggers injecting into the same prompt without overwriting previous fragments,
- or different prompt-specific text from same condition.

## Influence Map (draft behavior with explicit triggers)

| Input | Trigger logic | Injection behavior |
|---|---|---|
| `information_present` | If `true`, disable automatic broad search expansion; keep explicitly requested searches allowed. | Add guidance to avoid broad auto-search but still accept explicit `__searchQueries`. |
| `missing_spec[]` | If non-empty. | Inject listed fields directly into `Spezifikationen` guidance as "focus fields to extract/research". Keep simple. |
| `bad_format` | If per-item true OR aggregate threshold reached. | Trigger json-correction/formatter emphasis preemptively. |
| `wrong_information` | If true OR aggregate threshold reached. | Inject concise evidence/cross-check guidance text (prompt-specific variant per stage). |
| `wrong_physical_dimensions` | If true OR aggregate threshold reached. | Inject reasoning prompt to validate plausibility and correct unit formats. |
| `notes` | Optional and sanitized. | Inject as bounded supplemental context only. |

## Aggregate-to-Boolean Thresholds (new)

To convert multiple reviews into stable boolean triggers, aggregate **last 10 reviewed runs** in same subcategory.

Default trigger thresholds (initial):

- `bad_format_trigger = true` when `bad_format=true` in **>= 3 / 10**.
- `wrong_information_trigger = true` when `wrong_information=true` in **>= 3 / 10**.
- `wrong_physical_dimensions_trigger = true` when `wrong_physical_dimensions=true` in **>= 2 / 10**.
- `missing_spec_trigger = true` when a spec key appears in **>= 2 / 10** runs.
- `information_present_low_trigger = true` when `information_present=false` in **>= 4 / 10**.

Low-volume fallback:

- If fewer than 10 reviewed runs exist, use available runs with proportional thresholds and include a low-confidence flag in logs.

Reason: this gives deterministic trigger behavior while avoiding single-review overreaction.

## Example Item Policy

- Eligible example: same subcategory + status `reviewed`.
- Inject the latest reviewed example into `{{EXAMPLE_ITEM}}`.
- Redact and cap size before injection.
- Fallback to the current static prompt example when no reviewed item qualifies.

## Security Controls for Prompt Injection Risk

For all free-text injections (`notes` and any future text fields):

- strip code fences and role-like prefixes (`system:`, `assistant:`, `user:`),
- strip high-risk control sequences,
- enforce character allowlist where practical,
- hard cap per-field and total injected length,
- wrap injected text in bounded quote/context markers,
- fail-safe fallback to empty/default fragment on sanitizer error.

## Logging & Error Handling Requirements

Add structured logging for:

- normalization outcomes (presence/counts only),
- threshold computation and trigger states,
- placeholder resolution decisions,
- example selection/fallback,
- sanitizer fallback events.

Add try/catch around:

- review normalization,
- aggregate computation,
- placeholder assembly,
- example redaction.

All failures should degrade gracefully to current baseline behavior.


## Review Lifecycle & Training Data Retention

To avoid losing training signal when a run is first rejected and later accepted:

- Persist **review events** (iteration-level snapshots) instead of only the final review state.
- Keep both:
  - latest review summary on run record (for UI convenience),
  - append-only review history entries (for aggregation/training).
- Aggregation should read from review history entries so earlier "bad" feedback is preserved even if the last iteration is accepted.

Minimal-change implementation guidance:

- Reuse existing run identifiers and add a lightweight review-history record structure (or append-only JSON log) keyed by run + timestamp.
- Add logging around event persistence failures and fallback to latest-state-only mode if history write fails.
- Wrap history persistence in try/catch so run completion is not blocked by analytics logging issues.

## Data Contract Considerations

- Update shared model contract in `models/` first, then backend/frontend usage.
- Keep backward compatibility for existing runs without structured fields.
- Normalize booleans/nulls and sanitize `missing_spec[]` values.

## Open Questions (remaining)

1. Placeholder fallback is fixed to an empty string (`""`) when no signal is present.
2. Threshold values are fixed constants for now (no env configuration in first iteration).
3. Confirm if category-specific threshold overrides are needed in a later iteration.
4. Agent card should display review stats as percentages directly.

## Suggested Milestones (one next step at a time)

1. Finalize model contract and normalization behavior.
2. Implement placeholder resolver with logging and sanitizer.
3. Implement last-10 aggregate thresholds -> boolean trigger object.
4. Wire extraction/categorizer/supervisor placeholder replacements.
5. Add example-item injection and agent-card trigger metrics.


## Scope Guardrail (current iteration)

- Do **not** redesign supervisor output schema in this iteration.
- Keep supervisor behavior as-is and only consume the new review-learning injections where already planned.
- Revisit supervisor structured output alignment in a later iteration once extraction-side learning is validated.

## Success Criteria

- Fewer repeated reviewer corrections per subcategory.
- Improved first-pass acceptance rate.
- Reduced bad-format / wrong-info / wrong-dimension recurrence.
- Stable prompt size and no reliability regression.
