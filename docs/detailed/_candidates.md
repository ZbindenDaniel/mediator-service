# Additional detailed docs worth splitting out

These are candidate follow-up docs to keep ownership isolated and changes reviewable.

## Candidate domains
- **Shopware queue & sync lifecycle**
  - Likely code: `backend/shopware/client.ts`, `backend/shopware/queueClient.ts`, `backend/workers/processShopwareQueue.ts`, `backend/actions/sync-erp.ts`
- **CSV archive ingestion pipeline**
  - Likely code: `backend/importer.ts`, `backend/actions/csv-import.ts`, `backend/utils/csv-utils.ts`
- **Search & retrieval layer**
  - Likely code: `backend/actions/search.ts`, `backend/agentic/flow/item-flow-search.ts`, `backend/agentic/tools/tavily-client.ts`
- **Label/PDF rendering contracts**
  - Likely code: `backend/labelpdf.ts`, `backend/print.ts`, `frontend/public/print/*.html`, `backend/actions/print-label.ts`
- **Agentic prompt contract library**
  - Likely code: `backend/agentic/prompts/*.md`, `backend/agentic/flow/prompts.ts`, `backend/agentic/flow/schema-contract.ts`
- **Operational observability & event logs**
  - Likely code: `backend/src/lib/logger.ts`, `frontend/src/utils/logger.ts`, `frontend/src/utils/eventLogTopics.ts`, `backend/actions/recent-activities.ts`
- **Bulk operations & safety rules**
  - Likely code: `backend/actions/bulk-move-items.ts`, `backend/actions/bulk-delete-items.ts`, `backend/actions/delete-entity.ts`
- **Configuration and runtime modes**
  - Likely code/docs: `docs/ENVIRONMENT.md`, `backend/agentic/config.ts`, `backend/server.ts`, `.env.example`

## Why these first
- They each map to distinct code ownership zones and reduce merge conflicts.
- They are integration-heavy boundaries where contract drift is most likely.
- They can be documented incrementally without editing existing detailed docs.
