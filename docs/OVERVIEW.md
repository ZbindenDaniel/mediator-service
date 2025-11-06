# Project Overview

The mediator service coordinates warehouse inventory workflows by pairing a TypeScript/Node.js backend with a React frontend for managing boxes, items, and print assets. This document provides a planning-oriented snapshot of priorities, risks, and recent progress.

## Mission & Scope
- Provide API endpoints and background workers to manage boxes, items, QR scans, and CSV imports.
- Deliver a responsive React UI that surfaces search, detail, and import tooling for logistics teams.
- Maintain printable label templates and legacy scripts required for production operations.

## Domain Concepts
- **Items & ItemRefs** – Catalog entries describing IT equipment (e.g., laptops, monitors). `ItemRef` captures canonical
  metadata while individual `itemInstances` track stock, storage status, and historical changes.
- **Boxes (Behälter)** – Physical containers that hold one or more items. Boxes are colour-coded by warehouse section so staff
  can quickly find them even in a chaotic layout.
- **Locations & Sections** – Warehouse zones identified by colour/label that group boxes for faster retrieval. Box records link
  to these locations.
- **Agentic Runs** – AI-assisted enrichment flows that start from partial item data, perform targeted web searches, and propose
  missing attributes for human review before acceptance.
- **Imports & ERP Bridge** – CSV uploads seeded from an external ERP initialize the catalogue. Future integrations (e.g.,
  Shopware) will build on the same ingestion path.
- **Printing & QR Labels** – Boxes and larger standalone items receive QR codes and human-readable stickers. The printing stack
  generates label PDFs, stores previews, and dispatches jobs to CUPS-compatible printers.

## Architectural Patterns in Practice
- **Action architecture** – The backend dynamically loads `backend/actions/*` modules that wrap database calls in
  transactions, emit audit events, and centralize logging. Each action focuses on a discrete workflow (inventory movement,
  imports, printing, agentic lifecycle updates).
- **Shared models** – TypeScript interfaces in `models/` are consumed by backend and frontend builds to keep API contracts
  aligned. Both tiers import these definitions directly.
- **React composition** – The frontend organises screens under `frontend/src/components/`, leaning on shared layout,
  asynchronous loading states, and `react-router-dom` routes to keep behaviours consistent.
- **Observability expectations** – Logging helpers in `backend/src/lib/logger.ts` and `frontend/src/utils/logger.ts` surface
  structured context during API calls, agentic runs, and UI events. Error paths capture stack traces or actionable messages.
- **Printing pipeline** – Frontend `public/print` templates pair with backend print actions so the same markup can be rendered
  locally or streamed to printers without duplicating layout logic.

## Current Status
- Backend and frontend share aligned TypeScript models and rely on dynamic action loading for API routes.
- CSV import/export, QR scanning, and print label flows are available but still receive incremental polish.
- Legacy JavaScript scripts remain for compatibility; modernization continues incrementally.
- Shopware support currently covers read-only product search plus a queued sync pipeline awaiting a real dispatch client.
- The legacy ai-flow runtime has been ported into the mediator under `backend/agentic/`; follow-up work focuses on stabilising the
  in-process orchestrator and cleaning up the final integration tasks outlined in [SERVICE_FUSION](SERVICE_FUSION.md).

## Next Steps
- Finish wiring the new `AgenticModelInvoker` through backend services so queue workers and actions invoke models without the
  HTTP proxy fallback.
- Continue validating the migrated `backend/agentic/` modules (flows, tools, prompts) with focused tests and linting once the
  invoker is fully integrated.

## Risks & Dependencies
- Tests and builds require the `sass` CLI. Missing or partially installed `sass` causes `sh: 1: sass: not found`, and registry restrictions may prevent installing the dependency.
- Refer to [BUGS.md](BUGS.md) for additional tracked defects.

## Upcoming Opportunities
- Sanitize print preview URLs before injecting them into the DOM to avoid potential XSS issues.
- Capture dispatched CUPS job identifiers in logs so support staff can correlate queue issues with individual label requests.
- Enforce size limits and validate content for uploaded CSV files prior to writing them to disk.
- Integrate dependency vulnerability scanning (e.g., `npm audit`) once registry access is available.

## Recent Highlights
- Update the closing of larger tasks in [RECENT_HIGHLIGHTS]()

## Reference Links
- [Architecture Outline](ARCHITECTURE.md)
- [Component Responsibilities](../AGENTS.md)
- [Open Bugs](BUGS.md)
