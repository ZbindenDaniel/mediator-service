# Agent Execution Guide (Detailed)

This file contains the **detailed workflow guidance** for implementation work.

For quick repository orientation, use the root [`AGENTS.md`](../AGENTS.md).

## Purpose
- Keep implementation decisions consistent across agent and human contributors.
- Maintain observability and recovery paths (logging + meaningful error handling).
- Keep documentation and task tracking in sync with actual code changes.

## Standard execution flow
1. Read [`../OVERVIEW.md`](../OVERVIEW.md) and [`../todo.md`](../todo.md) and identify the active task.
2. Identify relevant files and record task TODOs before implementing.
3. Implement the smallest viable change.
4. Validate with targeted checks.
5. Update documentation to reflect final behaviour — see **Task completion requirements** below.

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

## Task completion requirements

A task is **not complete** until documentation is updated. This is required, not optional.

### OVERVIEW.md entry

Add a numbered entry at the top of the "Next steps" list:

```
N. ✅ <one-line summary of what changed and why>
   - **Why:** <reason for this approach or what alternative was rejected>
   - **Deferred:** <what was explicitly not done and why — or "nothing deferred">
```

The **Why** and **Deferred** bullets are required for any non-trivial decision. Single-line entries are fine for simple, self-evident changes.

### todo.md updates

- Mark or remove resolved items.
- Add newly discovered bugs to Priority 1, new features to Priority 2.
- Add new open questions to the "Open Questions" section.

### What to document about decisions

Record the following when they arise:
- Why this approach was chosen over a plausible alternative
- What was intentionally deferred and why (scope, risk, dependency)
- Any unexpected behavior encountered and how it was handled

These belong as brief inline comments in code (`// why`, not `// what`) and in the OVERVIEW.md entry for the task.

## Related references
- Architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Coding rules: [`CODING_GUIDELINES.md`](./CODING_GUIDELINES.md)
- Detailed index: [`detailed/README.md`](./detailed/README.md)
- Project status tracker: [`../OVERVIEW.md`](../OVERVIEW.md)
