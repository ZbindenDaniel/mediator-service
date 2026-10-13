// Feature keys shared by backend (gate, jobs) and frontend (hiding). See backend/lib/features.ts.
export const FEATURE_KEYS = [
  // Subsystems
  'agentic',            // AI enrichment: KI tab, AI bulk actions, agentic APIs, dispatcher
  'printing',           // labels + printer admin, print worker
  'shopware',           // shop badges/sync, shopware worker
  'erp-sync',           // kivitendo sync button + nightly ERP sync
  'stubs',              // Fundsachen page + box tab
  'statistics',         // dashboard/overview panels, stats, CO₂ values
  'help',               // help page + start redirect to it
  'intake',             // netboot intake station API
  'import-export',      // CSV import, data/item export
  'qr-scan',            // QR scanner, scan-based placement
  // Tabs
  'item-images',
  'item-attachments',   // attachments + external docs
  'logs',               // activity tabs on items/boxes + activities page
  'item-marks',
  'box-notes',
  'box-items',
  // Admin page cards not covered by a subsystem flag
  'admin-taxonomy',
  'admin-shelf-create',
  'admin-system-status'
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];
