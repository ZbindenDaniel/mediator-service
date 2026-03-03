# Planning v2.4

This document tracks planning inputs for **version 2.4**.

## Current status

No v2.4 implementation work has started yet.

Reason: separate upcoming planning work from shipped v2.3 history to keep release coordination auditable and reduce stale-plan noise in active documentation.

Higher-level goal: keep v2.4 planning minimal, explicit, and easy to execute in small reviewable steps.

## Planning intake template (use when v2.4 work starts)

- Goal: what outcome is needed.
- Reason: why this change is needed now.
- Scope: minimal files/modules to touch.
- Data contracts: confirm whether `models/` or API payloads are affected.
- Logging/error handling expectations: where existing logs/try-catch paths should be extended.

<!-- TODO(planning-v2.4): add first scoped v2.4 plan item when implementation begins. -->


## Intake: media handling simplification (pending)

- Goal: simplify media handling so item source media remains predictable and operational cleanup is explicit.
- Reason: recent incidents showed brittle cleanup behavior can target mounted shares unexpectedly when runtime/test configuration drifts.
- Higher-level goal: reduce accidental data loss risk by preferring explicit operator workflows over implicit recursive cleanup.
- Scope (minimal): document and enforce a single storage contract (`shopbilder` source by `Artikel_Nummer`, `shopbilder-import` flat sync mirror) without broad model rewrites.
- Data contracts: keep existing item/export contracts unchanged (`Grafikname`, `ImageNames`, CSV headers); only path-handling and operational policy should tighten.
- Logging/error handling: require structured logs for all destructive file operations and `try/catch` around filesystem mutations where recovery diagnostics are needed.
- Cleanup policy direction: runtime should avoid bulk recursive cleanup; when cleanup is needed, execute dedicated shell scripts manually or via explicit maintenance jobs.
