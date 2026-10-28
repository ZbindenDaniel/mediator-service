# AGENTS.md

How to work in this repo — for human contributors and coding agents. The mandatory documentation
rules and completion checklist live in [`CLAUDE.md`](CLAUDE.md).

## Orientation

1. [`OVERVIEW.md`](OVERVIEW.md) — current focus, system map, last 10 changes.
2. [`todo.md`](todo.md) — open bugs, feature queue, confirmed decisions.
3. The folder `README.md` of each area you touch (purpose, rules, decisions), then its topic
   changelog in [`docs/changelogs/`](docs/changelogs/README.md) and runbook in
   [`docs/detailed/`](docs/detailed/README.md).
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for cross-cutting structure;
   [`docs/CODING_GUIDELINES.md`](docs/CODING_GUIDELINES.md) for coding rules.

## Coding

- Smallest change that solves the task; follow existing action/lib/model patterns before adding abstractions.
- Types shared between backend and frontend live in `models/`; check both sides when you change one.
- Log at state transitions and failure boundaries with structured context; `try/catch` only where you can handle, translate or enrich the error.
- Keep diffs reviewable; remove TODOs and notes that your change makes stale.

## Planning (when asked for a plan, not code)

- State the goal and the value; target current behaviour (no legacy compatibility unless asked).
- Write the plan into the repo (`docs/plans/<topic>.md`, indexed in [`docs/plans/README.md`](docs/plans/README.md)) with file-level steps.
- Prefer the minimal design; call out changes that would add technical debt.
