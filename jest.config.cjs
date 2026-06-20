module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.ts',
    '**/backend/actions/__tests__/**/*.test.ts',
    '**/backend/agentic/__tests__/**/*.test.ts',
    '**/backend/integrations/**/__tests__/**/*.test.ts',
    '**/backend/**/__tests__/**/*.test.ts',
    '**/frontend/src/components/__tests__/**/*.test.tsx',
    '**/scripts/__tests__/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    // Uses old SQLite ctx.db API — needs rewrite after result-handler async migration
    '/backend/agentic/__tests__/result-handler.test.ts',
    // Fully commented-out test files (stubs for future work)
    '/test/cancel-agentic-run.test.ts',
    '/test/box-color-tag.test.ts',
    '/test/agentic-trigger-client.test.ts',
    '/test/shopware-sync-queue.test.ts',
    '/test/shopware-search-action.test.ts',
    '/test/shopware-queue-worker.test.ts',
    '/test/resolve-agentic-api-base.test.ts',
    '/test/remove-item.test.ts',
    '/test/quality-badge.test.ts',
    '/test/print-labels.test.ts',
    '/test/move-item-location.test.ts',
    '/test/item-match-selection.test.ts',
    '/test/item-list-quality.test.ts',
    '/test/item-list-columns.test.ts',
    '/test/item-form-shared.test.ts',
    '/test/item-form-agentic-photos.test.ts',
    '/test/item-detail-ui.test.ts',
    '/test/item-detail-agentic-cancel.test.ts',
    '/test/item-create-manual.test.ts',
    '/test/import-item-uuid-behavior.test.ts',
    '/test/import-item-trigger-dispatch.test.ts',
    '/test/import-item-agentic-persistence.test.ts',
    '/test/import-item-agentic-disabled.test.ts',
    '/test/import-edit-media-integration.test.ts',
    '/test/harness-utils.test.ts',
    '/test/frontend-routes.test.ts',
    '/test/delete-entity.test.ts',
    '/frontend/src/components/__tests__/ItemListPage.test.tsx',
    '/frontend/src/components/__tests__/ItemForms.test.tsx',
    '/frontend/src/components/__tests__/ItemFormEditPhotos.test.tsx',
    '/frontend/src/components/__tests__/ItemFormAgentic.test.tsx',
    '/frontend/src/components/__tests__/ItemDetail.test.tsx',
    '/frontend/src/components/__tests__/DialogProvider.test.tsx',
    '/frontend/src/components/__tests__/BulkItemActionBar.test.tsx',
    '/frontend/src/components/__tests__/BoxDetail.test.tsx',
    '/backend/actions/__tests__/forward-agentic-trigger.test.ts',
    // Rewritten from scratch — removed from ignore list:
    // /backend/agentic/__tests__/think-tag-parsing.test.ts (updated interface, full AgenticTarget)
    // /backend/agentic/__tests__/supervisor-pass-normalization.test.ts (updated interface)
    // /backend/agentic/__tests__/review-metadata-normalization.test.ts (async deps + withTransaction mock)
    '/backend/agentic/__tests__/item-flow-search.test.ts',
    '/backend/agentic/__tests__/item-flow-dispatch.test.ts',
    '/test/agentic/item-flow.test.ts',
    // Rewritten and active — removed from ignore list:
    // /backend/agentic/__tests__/invoker-adapter.test.ts (converted SQLite mocks to async)
    // /backend/agentic/__tests__/item-flow-planner-control.test.ts (updated stale query assertions)
    // /backend/agentic/__tests__/item-flow-search-sanitization.test.ts (updated paragraph bound)
    // /backend/agentic/__tests__/item-flow-search-transcript.test.ts (updated call counts)
    // /backend/agentic/__tests__/item-flow-trigger-fragments.test.ts (added ../../db mock)
    // CSV import action now requires ZIP archives — test needs rewrite
    '/test/csv-import-duplicate-guard.test.ts',
    // Missing lib/logger module path — needs module resolution fix
    '/frontend/src/components/__tests__/PlacementScanView.test.tsx',
    // Frontend module resolution (models alias) issue — needs jest moduleNameMapper
    '/test/frontend-agentic-review-flow.test.ts',
    // Uses old topic-filter module cache invalidation approach — unreliable in Jest
    '/test/event-log-topics.test.ts',
    // Uses old AgenticServiceDependencies interface (pre-Postgres refactor) — needs rewrite
    // Use SQLite directly — need Postgres rewrite before running in CI
    '/test/export-items.test.ts',
    '/test/csv-ingest-datum-erfasst.test.ts',
    '/test/csv-ingest-decimal-normalization.test.ts',
    '/test/csv-ingest-insertdateset.test.ts',
    '/test/csv-ingest-kivitendo-schema.test.ts',
    '/test/csv-ingest-location-fallback.test.ts',
    '/test/csv-ingest-onhand-fallback.test.ts',
    '/test/csv-ingest-produkt-schema.test.ts',
    '/test/csv-ingest-shared-artikelnummer.test.ts',
    '/test/csv-ingest-standort-label.test.ts',
    '/test/item-persistence-reference-behavior.test.ts',
    '/test/item-category-roundtrip.test.ts',
    '/test/langtext-contract.test.ts',
    '/test/list-items-for-export-order.test.ts',
    '/test/save-item-quality.test.ts',
    '/test/agentic-review-persistence.test.ts',
    '/test/agentic-review-metrics-rows.test.ts',
    '/test/agentic-health-proxy.test.ts',
    '/test/apiRoutes.test.ts',
  ],
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};
