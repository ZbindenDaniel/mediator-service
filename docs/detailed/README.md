# Detailed Documentation Index

Use this directory as the single navigation root for deep-dive operational and implementation guides.

## Audience
- Operators: runbooks and incident/triage playbooks.
- Developers: architecture-adjacent implementation details and contracts.
- Agents: task execution context and deep-dive references.

## Canonical references
- [`docs/detailed/traceability-matrix.md`](./traceability-matrix.md) (canonical doc-to-code path mapping for all detailed domains)
- [`docs/detailed/diagrams/README.md`](./diagrams/README.md) (text-first placeholders for future flow diagrams)
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`docs/AGENT.md`](../AGENT.md)
- [`OVERVIEW.md`](../../OVERVIEW.md)

## Domain runbooks
| Doc | Domain |
|---|---|
| [`items.md`](./items.md) | Item/instance lifecycle, fields, actions, quality assessment flow |
| [`boxes.md`](./boxes.md) | Box/shelf hierarchy, relocation, printing, import touchpoints |
| [`stubs.md`](./stubs.md) | Box stubs — uncatalogued shelf content triage tool |
| [`qr_codes.md`](./qr_codes.md) | QR generation, scan lifecycle, search-scan mode, audit logging |
| [`printing.md`](./printing.md) | Label printing, preview/dispatch, template/route mapping |
| [`import_export.md`](./import_export.md) | CSV/ZIP ingestion, export regimes, alias mapping |
| [`agentic-basics.md`](./agentic-basics.md) | Agentic orchestration overview, lifecycle, guardrails |
| [`item-flow.md`](./item-flow.md) | Agentic extraction/categorization/pricing stage contracts |
| [`review-flow.md`](./review-flow.md) | Review lifecycle, quality assessment creation flow |
