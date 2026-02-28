# AGENTS.md

This file is the **quick-start guide** for both human contributors and coding agents.

For deep implementation instructions, use [`docs/AGENT.md`](docs/AGENT.md).

## Repository overview
- `backend/`: API actions, services, agentic orchestration, persistence helpers.
- `frontend/`: React UI, routing, feature components, and client-side utilities.
- `models/`: shared TypeScript contracts used by backend and frontend.
- `docs/`: architecture, planning, operations, and domain-specific implementation notes.
- `OVERVIEW.md`: active task tracker and near-term priorities.

## Read these first
1. [`OVERVIEW.md`](OVERVIEW.md) – current focus and next queued work.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – system boundaries and responsibilities.
3. [`docs/AGENT.md`](docs/AGENT.md) – detailed agent workflow and guardrails.
4. [`docs/CODING_GUIDELINES.md`](docs/CODING_GUIDELINES.md) – complete coding standards.

## Basic coding guidelines (summary)
- Keep changes minimal and scoped to the task.
- Reuse existing mediator/service patterns before introducing new abstractions.
- Preserve shared data contracts across `models/` and `backend/src/models/`.
- Add or update logging and error handling where failures are actionable.
- Prefer updating existing docs/TODO notes over creating parallel documentation paths.

## Documentation map
- Project status: [`OVERVIEW.md`](OVERVIEW.md)
- Documentation overview: [`docs/OVERVIEW.md`](docs/OVERVIEW.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Detailed runbooks/index: [`docs/detailed/README.md`](docs/detailed/README.md)
- Planning backlog: [`docs/PLANS.md`](docs/PLANS.md)
