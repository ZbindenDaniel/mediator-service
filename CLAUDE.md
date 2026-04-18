# CLAUDE.md

This file is read automatically by Claude Code at session start. All instructions here are **mandatory**.

## Read these before any implementation work

1. [`OVERVIEW.md`](OVERVIEW.md) — current focus, active task, and recent change history
2. [`todo.md`](todo.md) — open bugs, feature queue, and confirmed decisions

Do not skip this step. Understanding active context prevents conflicting changes.

## Mandatory: document every completed task

A task is **not complete** until documentation is updated. Before ending your response, you must:

### 1. Add an entry to `OVERVIEW.md`

Insert a new numbered entry at the top of the "Next steps" list. Use this format:

```
N. ✅ <one-line summary of what changed and why>
   - **Why:** <reason for this approach — what problem it solves or what alternative was rejected>
   - **Deferred:** <what was explicitly not done and why — or "nothing deferred">
```

- For simple, self-evident changes a single summary line is enough.
- For any non-trivial decision, the **Why** and **Deferred** bullets are required.
- The entry must reflect the actual outcome, not the original intent.

### 2. Update `todo.md`

- If the task resolved a listed bug or feature item, mark it done or remove it.
- If new issues were discovered during the work, add them to the appropriate priority section.
- If new open questions surfaced (unclear behavior, unresolved policy, etc.), add them to "Open Questions".

### 3. Document non-obvious decisions in code

Add a brief comment (one line) explaining **why** when:
- You chose one approach over a plausible alternative
- You intentionally left something incomplete
- You worked around unexpected behavior

Do not comment on what the code does — only on why it does it that way.

## Task completion checklist

Run through this before finishing:

- [ ] Read `OVERVIEW.md` and `todo.md` at the start
- [ ] `OVERVIEW.md` has a new entry with what changed, why, and what was deferred
- [ ] `todo.md` is updated if new issues were found or listed items were resolved
- [ ] Non-obvious implementation decisions have a WHY comment
- [ ] Any deferred work is explicitly noted (in the OVERVIEW entry or todo.md)

## Related files

- Quick-start guide: [`AGENTS.md`](AGENTS.md)
- Detailed workflow: [`docs/AGENT.md`](docs/AGENT.md)
- Coding standards: [`docs/CODING_GUIDELINES.md`](docs/CODING_GUIDELINES.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
