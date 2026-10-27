# docs/detailed/

Per-domain runbooks: how a feature works, which code owns it, and how to troubleshoot it. Change
history lives in [`../changelogs/`](../changelogs/README.md); terminology in [`glossary.md`](glossary.md).
New runbooks can start from [`_template.md`](_template.md).

| Doc | Domain |
|---|---|
| [items.md](items.md) | References vs instances, fields, item actions |
| [boxes.md](boxes.md) | Box/shelf hierarchy, relocation, box labels |
| [stubs.md](stubs.md) | Stubs: markers for uncatalogued shelf content |
| [qr_codes.md](qr_codes.md) | QR payloads, scan routing, search-scan and placement modes |
| [printing.md](printing.md) | Label rendering, preview, dispatch to CUPS queues |
| [printer-server-setup.md](printer-server-setup.md) | Raspberry Pi CUPS server install and connection |
| [media-storage.md](media-storage.md) | Photos, attachments, identifier-keyed external docs |
| [import_export.md](import_export.md) | CSV/ZIP import, export regimes (backup vs ERP), column aliases |
| [nightly-erp-sync.md](nightly-erp-sync.md) | Nightly kivitendo sync: opt-in model, toggle, troubleshooting |
| [shopware.md](shopware.md) | Shopware search and the queued product/stock sync |
| [agentic-basics.md](agentic-basics.md) | Agentic run lifecycle, queue, guardrails |
| [item-flow.md](item-flow.md) | Search → categorize → extract → price stage contracts |
| [review-flow.md](review-flow.md) | Review wizard, decisions, restart semantics |
| [agentic-search-events.md](agentic-search-events.md) | Inspecting stored agentic search events |
| [co2-impact.md](co2-impact.md) | CO₂ recovery label: formula, thresholds, contract |
| [spare-parts-catalog.md](spare-parts-catalog.md) | Assembly contracts and the Zerlegen UI |
| [component-lifecycle.md](component-lifecycle.md) | In-device components (disks) from intake to standalone item |
| [intake.md](intake.md) | Device intake station: flow, endpoints, phases |
| [intake-image-guide.md](intake-image-guide.md) | Writing the netboot intake script ([`intake-image.http`](intake-image.http) is the runnable contract) |
| [item-detail-layout.md](item-detail-layout.md) | Item detail page: tabs and information hierarchy |
| [glossary.md](glossary.md) | Canonical terms (Use/Avoid pairs) |
