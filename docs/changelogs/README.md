# docs/changelogs/

Topic-based changelogs — one file per major domain. Each entry records what changed, why that approach was chosen, and what was deliberately left out.

## Topics

| File | Domain |
|---|---|
| [item-lifecycle.md](item-lifecycle.md) | Item creation, editing, quality assessment, specs, accessories, spare parts |
| [agentic.md](agentic.md) | AI enrichment pipeline: search, extraction, categorization, pricing, review |
| [erp-sync.md](erp-sync.md) | ERP import/export, CSV sync, Langtext formatting, Shopware |
| [printing.md](printing.md) | Label printing, CUPS integration, printer setup, print queues |
| [media.md](media.md) | Photos, file attachments, external docs, WebDAV storage |
| [storage.md](storage.md) | Boxes, locations, relocation, stubs, inventory |
| [intake.md](intake.md) | Device intake station, cataloguing flow, netboot |
| [scanning.md](scanning.md) | QR codes, scanner workflows, scan audit |
| [ui.md](ui.md) | Frontend UI/UX: layout, navigation, cross-cutting UI changes |
| [testing.md](testing.md) | Test coverage, test rewrites, test infrastructure |
| [docs-infra.md](docs-infra.md) | Documentation, configuration, infrastructure, scripts |

## Entry format

```
## <entry number>. <one-line summary>
**Date:** YYYY-MM-DD
**Why:** reason for this approach — what problem it solves or what alternative was rejected
**Deferred:** what was explicitly not done and why — or "nothing deferred"
```

## Which changelog to use

Route entries to the domain where the **primary model or user-facing behavior changed**.
A frontend change that follows a backend contract change goes to the backend domain's changelog.
Pure UI layout changes with no model impact go to `ui.md`.
Cross-cutting refactors that don't fit a single domain go to `docs-infra.md`.
