# Plans & Next Steps

This document tracks **active** planning work only.

## Current planning status

There are currently **no active multi-step plans in progress**.

Reason: keep release documentation and operational guidance focused on current behavior, avoid carrying stale implementation plans, and reduce unnecessary structural additions while the release-doc pass is ongoing.

Higher-level goal: maintain a clean planning queue so teams can quickly identify what is truly in progress versus what has already shipped and moved to highlights.

## How to add the next plan (when needed)

When a new plan starts, add a single section with:
- Goal (what outcome is needed now).
- Reason (why the change is needed).
- Scope boundaries (minimal files/components to touch).
- Step checklist (one step at a time, reviewable increments).
- Data-contract impact notes (if `models/` or API payloads are affected).

After work ships, move implementation/change-log details to `docs/RECENT_HIGHLIGHTS.md` and return this file to active plans only.


For release-specific planning intake, use `docs/PLANNING_V_2_4.md`.
