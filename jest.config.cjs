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
    // Rewritten and active — removed from ignore list:
    // /backend/agentic/__tests__/result-handler.test.ts (converted SQLite ctx.db API to async Postgres shape)
    // Fully commented-out test files (stubs for future work)
    '/test/cancel-agentic-run.test.ts',
    '/test/box-color-tag.test.ts',
    // Rewritten and active — removed from ignore list:
    // /test/agentic-trigger-client.test.ts (updated to use artikelNummer instead of itemId, added 2 more tests)
    '/test/shopware-sync-queue.test.ts',
    '/test/shopware-search-action.test.ts',
    '/test/shopware-queue-worker.test.ts',
    // Rewritten and active — removed from ignore list:
    // /test/resolve-agentic-api-base.test.ts (resolveAgenticApiBase removed; rewrote as tests for extractAgenticFailureReason/describeAgenticFailureReason)
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
    // Rewritten and active — removed from ignore list:
    // /test/harness-utils.test.ts (replaced Jest internals test with resolveEventLogLevel assertions)
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
    // Rewritten and active — removed from ignore list:
    // /backend/actions/__tests__/forward-agentic-trigger.test.ts (rewrote: tests start/restart/decline branches, no SQLite or invokeModel)
    // Rewritten from scratch — removed from ignore list:
    // /backend/agentic/__tests__/think-tag-parsing.test.ts (updated interface, full AgenticTarget)
    // /backend/agentic/__tests__/supervisor-pass-normalization.test.ts (updated interface)
    // /backend/agentic/__tests__/review-metadata-normalization.test.ts (async deps + withTransaction mock)
    // Rewritten and active — removed from ignore list:
    // /backend/agentic/__tests__/item-flow-search.test.ts (rewrote: added shouldSearch param, updated assertions)
    // Rewritten and active — removed from ignore list:
    // /backend/agentic/__tests__/item-flow-dispatch.test.ts (rewrote: tests dispatchAgenticResult directly instead of full runItemFlow)
    '/test/agentic/item-flow.test.ts',
    // Rewritten and active — removed from ignore list:
    // /backend/agentic/__tests__/invoker-adapter.test.ts (converted SQLite mocks to async)
    // /backend/agentic/__tests__/item-flow-planner-control.test.ts (updated stale query assertions)
    // /backend/agentic/__tests__/item-flow-search-sanitization.test.ts (updated paragraph bound)
    // /backend/agentic/__tests__/item-flow-search-transcript.test.ts (updated call counts)
    // /backend/agentic/__tests__/item-flow-trigger-fragments.test.ts (added ../../db mock)
    // CSV import action now requires ZIP archives — test needs rewrite
    '/test/csv-import-duplicate-guard.test.ts',
    // Rewritten and active — removed from ignore list:
    // /frontend/src/components/__tests__/PlacementScanView.test.tsx (fixed mock path lib/logger → utils/logger)
    // Rewritten and active — removed from ignore list:
    // /test/frontend-agentic-review-flow.test.ts (moved buildAgenticReviewSubmissionPayload to agenticReviewMapping)
    // Rewritten and active — removed from ignore list:
    // /test/event-log-topics.test.ts (module-cache pattern verified working)
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
    // Rewritten and active — removed from ignore list:
    // /test/agentic-review-persistence.test.ts (rewrote: dropped SQLite schema test + invokeModel, added no-review and queue-event tests)
    // Rewritten and active — removed from ignore list:
    // /test/agentic-review-metrics-rows.test.ts (updated labels to German, simplified format)
    // Rewritten and active — removed from ignore list:
    // /test/agentic-health-proxy.test.ts (rewrote: mocked db-client.query instead of SQLite, async checkAgenticHealth)
    // Rewritten and active — removed from ignore list:
    // /test/apiRoutes.test.ts (rewrote move-box tests: mocked db-client.withTransaction instead of SQLite)
  ],
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};
