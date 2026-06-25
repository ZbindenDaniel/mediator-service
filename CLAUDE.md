# CLAUDE.md

This file is read automatically by Claude Code at session start. All instructions here are **mandatory**.

## Read these before any implementation work

1. [`OVERVIEW.md`](OVERVIEW.md) — current focus and the last 10 recent changes (the system map links deeper)
2. [`todo.md`](todo.md) — open bugs, feature queue, and confirmed decisions

Do not skip this step. Understanding active context prevents conflicting changes.

## Mandatory: document every completed task

A task is **not complete** until documentation is updated. Before ending your response, you must complete all three steps below.

### 1. Add a one-liner to `OVERVIEW.md`

Add a single line to the top of the **"Recent changes"** section:

```
N. ✅ <one-line summary> → [topic]
```

Where `[topic]` is the changelog file the full entry lives in (e.g., `→ [agentic]`, `→ [printing]`, `→ [item-lifecycle]`).

**Keep Recent changes at 10 entries.** When it reaches 11, drop the oldest line.

### 2. Add the full entry to the topic changelog

Open `docs/changelogs/<topic>.md` and insert a new entry at the top (after the header), using this format:

```markdown
## N. ✅ <one-line summary>
**Why:** <reason for this approach — what problem it solves or what alternative was rejected>
**Deferred:** <what was explicitly not done and why — or "nothing deferred">
```

Topic files and their domains:

| File | Covers |
|---|---|
| `item-lifecycle.md` | Item CRUD, quality, specs, accessories, spare parts, CO₂ |
| `agentic.md` | AI enrichment pipeline, search, extraction, review flow |
| `erp-sync.md` | ERP import/export, CSV, Langtext, nightly sync, Shopware |
| `printing.md` | Labels, CUPS, printer queues, drivers |
| `media.md` | Photos, attachments, external docs, WebDAV |
| `storage.md` | Boxes, locations, relocation, stubs, placement |
| `intake.md` | Device intake station, netboot, cataloguing flow |
| `scanning.md` | QR codes, scanner workflows, scan audit |
| `ui.md` | Frontend layout, navigation, help pages, cross-cutting UI |
| `testing.md` | Test coverage, test rewrites, test infrastructure |
| `docs-infra.md` | Documentation, config, Docker, DB migrations, scripts |

When a change spans multiple topics, pick the domain where the primary model or user-facing behavior changed.

### 3. Update `todo.md`

- If the task resolved a listed bug or feature item, mark it done or remove it.
- If new issues were discovered during the work, add them to the appropriate priority section.
- If new open questions surfaced, add them to "Open Questions".

### 4. Document non-obvious decisions in code

Add a brief comment (one line) explaining **why** when:
- You chose one approach over a plausible alternative
- You intentionally left something incomplete
- You worked around unexpected behavior

Do not comment on what the code does — only on why it does it that way.

## Task completion checklist

- [ ] Read `OVERVIEW.md` current focus and recent changes at the start
- [ ] One-liner added to OVERVIEW.md "Recent changes" with `→ [topic]` tag
- [ ] Full entry (Why/Deferred) added to `docs/changelogs/<topic>.md`
- [ ] `todo.md` updated if items were resolved or new issues found
- [ ] Non-obvious decisions have a WHY comment in code
- [ ] Deferred work is explicitly noted

## Related files

- Quick-start guide: [`AGENTS.md`](AGENTS.md)
- Detailed workflow: [`docs/AGENT.md`](docs/AGENT.md)
- Coding standards: [`docs/CODING_GUIDELINES.md`](docs/CODING_GUIDELINES.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Changelogs: [`docs/changelogs/`](docs/changelogs/)
