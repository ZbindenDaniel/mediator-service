# AGENTS.md

This file is the **quick-start guide** for both human contributors and coding agents.

For deep implementation instructions, use [`docs/AGENT.md`](docs/AGENT.md).

## Repository overview
- `backend/` — Express server, action handlers, agentic pipeline, persistence. See [backend/README.md](backend/README.md).
- `frontend/` — React SPA, components, API clients. See [frontend/README.md](frontend/README.md).
- `models/` — shared TypeScript types used by both backend and frontend. See [models/README.md](models/README.md).
- `contracts/` — runtime JSON contracts (quality questions, specs, disassembly). See [contracts/README.md](contracts/README.md).
- `cups/` — CUPS print server Docker image. See [cups/README.md](cups/README.md).
- `docs/` — architecture, runbooks, changelogs, planning.
- `OVERVIEW.md` — current focus, system map, and last 10 changes.

Each folder has a README.md describing its purpose, contents, relations, scope, rules, and key decisions.

## Documentation is mandatory

Every completed task must update `OVERVIEW.md` and the relevant topic changelog before the response ends. See [`CLAUDE.md`](CLAUDE.md) for the required format and completion checklist.

## Read these first
1. [`OVERVIEW.md`](OVERVIEW.md) — current focus and system map.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system boundaries and responsibilities.
3. [`docs/AGENT.md`](docs/AGENT.md) — detailed agent workflow and guardrails.
4. [`docs/CODING_GUIDELINES.md`](docs/CODING_GUIDELINES.md) — complete coding standards.

## Basic coding guidelines (summary)
- Keep changes minimal and scoped to the task.
- Reuse existing patterns before introducing new abstractions.
- Preserve shared data contracts in `models/`.
- Add or update logging where failures are actionable.

## Documentation map
- Current focus: [`OVERVIEW.md`](OVERVIEW.md)
- Runbooks: [`docs/detailed/README.md`](docs/detailed/README.md)
- Changelogs: [`docs/changelogs/README.md`](docs/changelogs/README.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Planning backlog: [`docs/PLANS.md`](docs/PLANS.md)
