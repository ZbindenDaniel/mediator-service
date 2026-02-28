# Agent Execution Guide (Detailed)

This file contains the **detailed workflow guidance** for implementation work.

For quick repository orientation, use the root [`AGENTS.md`](../AGENTS.md).

## Purpose
- Keep implementation decisions consistent across agent and human contributors.
- Maintain observability and recovery paths (logging + meaningful error handling).
- Keep documentation and task tracking in sync with actual code changes.

## Standard execution flow
1. Read [`../OVERVIEW.md`](../OVERVIEW.md) and identify the active task.
2. Identify relevant files and record task TODOs before implementing.
3. Implement the smallest viable change.
4. Validate with targeted checks.
5. Update documentation/TODOs to reflect final behaviour.

## Planning mode expectations
When asked to produce a plan without coding:
1. Clarify goal, motivation, and expected value.
2. Record the plan in repository docs so others can execute it.
3. Target current behaviour (skip legacy compatibility unless requested).
4. Prefer minimal, elegant solutions over broad rewrites.
5. Provide actionable file-level steps with direct references.
6. Structure work for parallel execution where possible.
7. Challenge changes that create avoidable technical debt.

## Coding mode guardrails
- Follow established architecture and mediator patterns.
- Reuse shared utilities from backend/frontend common modules first.
- Double-check contract changes in shared model files.
- Add/update logging and try/catch paths where they provide recovery or diagnostics.
- Keep diffs reviewable and tightly scoped.
- Remove stale TODOs/notes when they are no longer accurate.

## Related references
- Architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Coding rules: [`CODING_GUIDELINES.md`](./CODING_GUIDELINES.md)
- Detailed index: [`detailed/README.md`](./detailed/README.md)
- Project status tracker: [`../OVERVIEW.md`](../OVERVIEW.md)
