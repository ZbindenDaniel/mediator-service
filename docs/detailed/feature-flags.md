# Feature flags

> [!NOTE]
> Deployment-level only: one manifest per deployment decides which features exist. Per-group or
> per-role features were considered and left out (no use case yet); *who may do what* will be a
> separate permissions concept. Design: [`PLANNING_NEW_USE_CASE.md`](../PLANNING_NEW_USE_CASE.md) §10.2/§12.2.

## In short

- **Default: everything on.** A deployment without a manifest (revamp-it) is unchanged.
- **Switch features off** with `FEATURES` (inline JSON) or `FEATURES_FILE` (path to a JSON file):
  ```json
  { "agentic": false, "printing": false }
  ```
- **Off means blocked, not just hidden.** The feature's API answers 404, its background job doesn't
  start, and the UI doesn't show it.
- **Typos stop the app at startup** (`Unknown feature "item-atachments"`), as does invalid JSON.
  This is deliberate: a silently ignored typo would leave a feature on.
- The catalogue deployment's manifest, based on the meeting of 2026-10-13:
  [`config/features.catalogue.example.json`](../../config/features.catalogue.example.json).

## The features

| Key | What it covers | Backend effect when off |
|---|---|---|
| `agentic` | KI tab, AI bulk action, AI step in item creation, AI admin cards, chat | `agentic-*` + `chat` + `spec-gap` APIs 404; dispatcher not started |
| `printing` | label/print buttons, auto-print, printer admin cards | print APIs 404; print worker not started |
| `shopware` | shop badges, column, filter, buttons, admin card | shopware APIs 404; sync worker not started |
| `erp-sync` | "Kivi Sync" bulk button, sync-date sorting, nightly-sync card | `sync-erp` + admin APIs 404; nightly sync skipped |
| `stubs` | Fundsachen page, nav link, shelf tab | stub APIs 404 |
| `statistics` | overview panel (empty state shows a hint instead), CO₂ values | none (`/api/overview` also feeds other cards) |
| `help` | help page, nav link, first-steps redirect | `/api/user-docs` 404 |
| `intake` | netboot intake station | `/api/intake/*` 404 |
| `import-export` | import/export admin cards, bulk CSV export | import/export APIs 404 |
| `qr-scan` | scanner page, scan buttons, placement scanning | `qr-scan` API 404 |
| `item-images` | Bilder tab | none (UI only) |
| `item-attachments` | Anhänge tab, external docs | attachment + external-doc APIs 404 |
| `logs` | Aktivitäten tabs (items + boxes), activities page | `recent-activities` API 404 |
| `item-marks` | Markierung tab, "Markiert" filter | `user-marks` API 404 |
| `box-notes` | box Notizen tab | none (UI only) |
| `box-items` | box Artikel tab | none (UI only) |
| `admin-taxonomy` | taxonomy admin link and page | taxonomy + contracts admin APIs 404 |
| `admin-shelf-create` | shelf creation card | none (shares the box-create API) |
| `admin-system-status` | system status card | none |

"UI only" rows have no API of their own to block (the data comes with the item/box), so hiding is
the whole effect.

## How it works

```
FEATURES / FEATURES_FILE ──► backend/lib/features.ts (parse + validate, fail fast)
                               ├─► dispatcher: action.feature off → 404
                               ├─► background jobs: not started / skipped
                               └─► GET /api/app-config ──► FeaturesContext (frontend)
                                                             ├─► useFeature('…') / <Feature name="…">
                                                             └─► tabFeatures.ts: hidden tabs + ?tab= fallback
```

- Feature keys live in [`models/features.ts`](../../models/features.ts), shared by backend and frontend.
- The backend is the security boundary; the frontend only hides. Components are gated where they
  mount, so a hidden feature never calls its blocked API.
- Changing the manifest needs an app restart.

## Adding a new flag

1. Add the key (with a one-line comment) to `models/features.ts`.
2. Tag the feature's actions with `feature: '<key>'` in their `defineHttpAction({ … })`.
3. Gate any background job with `isFeatureEnabled('<key>')`.
4. Hide the UI with `useFeature` / `<Feature>`; for a detail tab, add it to `lib/tabFeatures.ts`.
5. Add it to the table above.

## Not covered yet

- Per-group/role features (decided against for now) and role permissions such as deleting
  (separate concept, see [`tenancy.md`](./tenancy.md) and `todo.md`).
- The older env switches (`SHOPWARE_SYNC_ENABLED`, `ERP_SYNC_ENABLED`, …) still exist; a job only
  runs if both its env switch and its feature are on.
- Simple mode stays a separate per-user display toggle.
