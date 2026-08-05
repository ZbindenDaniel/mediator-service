// Creation of in-device components from an intake scan.
//
// A detected sub-device becomes a first-class item instance ONLY when it has a usable serial
// (disks, some NICs/GPUs). It carries NO Artikelnummer while inside its parent (deferred
// identity); its reports key on its serial; its identity is set once, later, at Zerlegung.
// Serialless components (typical PCI cards) are NOT auto-created here — they fill assembly info
// via question pre-fill instead (see intake-quality-map). Kind-agnostic: the serial is the gate.
//
// This runs at the intake "ref" step, once the parent machine item exists. It is idempotent
// on re-scan: a component is keyed on its serial, so re-running never duplicates it.

import type { PoolClient } from 'pg';
import { withTransaction } from '../db-client';
import { generateComponentUUID } from './itemIds';
import { isUsableSerial } from './component-serial';
import type { IntakeComponent } from '../../models/intake';

export interface SyncComponentsDeps {
  now?: () => Date;
  genUUID?: () => string;
  logEvent?: (e: {
    Actor: string;
    EntityType: string;
    EntityId: string;
    Event: string;
    Meta: string;
  }) => Promise<unknown> | unknown;
}

export interface SyncComponentsResult {
  created: Array<{ itemUUID: string; serial: string; slotKey: string }>;
  skipped: Array<{ reason: 'no-serial' | 'exists'; slotKey: string; serial: string | null }>;
}

async function componentUUIDFree(client: PoolClient, uuid: string): Promise<boolean> {
  const r = await client.query('SELECT 1 FROM items WHERE "ItemUUID" = $1 LIMIT 1', [uuid]);
  return r.rowCount === 0;
}

/**
 * Create one in-device component per detected component that has a usable serial, linked to
 * `parentUUID` via a `Zerlegt_aus` relation. Skips components whose serial is missing/placeholder
 * (can't key reports — e.g. most PCI cards; those fill assembly info instead) and those whose
 * serial already has an item (idempotent). Whole batch runs in one transaction. Pass the
 * normalized component list (`normalizeScanComponents`).
 */
export async function syncInDeviceComponents(
  parentUUID: string,
  components: IntakeComponent[] | null | undefined,
  deps: SyncComponentsDeps = {}
): Promise<SyncComponentsResult> {
  const result: SyncComponentsResult = { created: [], skipped: [] };
  if (!Array.isArray(components) || components.length === 0) return result;

  const now = deps.now ?? (() => new Date());
  const genUUID = deps.genUUID ?? generateComponentUUID;

  await withTransaction(async (client) => {
    for (const comp of components) {
      const slotKey = (comp?.slotKey ?? '').trim();
      // Serial is the report/identity key; wwn is the accepted fallback when firmware hides it.
      const rawSerial = (comp?.serial ?? comp?.wwn ?? '').trim();

      if (!isUsableSerial(rawSerial)) {
        // Serialless (e.g. PCI card): not an item; captured as assembly info elsewhere.
        result.skipped.push({ reason: 'no-serial', slotKey, serial: rawSerial || null });
        continue;
      }

      // Idempotency: a drive's serial is globally unique, so if any item already carries it
      // (still in-device, or already graduated) we must not create a second one.
      const existing = await client.query(
        'SELECT "ItemUUID" FROM items WHERE "SerialNumber" = $1 LIMIT 1',
        [rawSerial]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        result.skipped.push({ reason: 'exists', slotKey, serial: rawSerial });
        continue;
      }

      // Mint a temporary component UUID, guarding against the (unlikely) collision.
      let uuid = '';
      for (let i = 0; i < 5; i++) {
        const candidate = genUUID();
        if (await componentUUIDFree(client, candidate)) { uuid = candidate; break; }
      }
      if (!uuid) throw new Error('failed to mint a unique component UUID');

      const ts = now().toISOString();
      const specs: Record<string, string> = {};
      if (comp.kind) specs.Kind = String(comp.kind);
      if (typeof comp.sizeGb === 'number' && Number.isFinite(comp.sizeGb)) specs.Size = `${comp.sizeGb} GB`;
      if (comp.type) specs.Type = String(comp.type);
      if (comp.model) specs.Model = String(comp.model);
      if (comp.vendor) specs.Hersteller = String(comp.vendor);
      for (const [k, v] of Object.entries(comp.attributes ?? {})) specs[k] = String(v);
      const specsJson = Object.keys(specs).length > 0 ? JSON.stringify(specs) : null;

      // In-device component: no Artikel_Nummer, no BoxID — excluded from lists/export/print
      // until it graduates.
      await client.query(
        `INSERT INTO items ("ItemUUID","Artikel_Nummer","BoxID","Location","Auf_Lager","SerialNumber","InstanceSpecs","Datum_erfasst","UpdatedAt")
         VALUES ($1, NULL, NULL, NULL, 1, $2, $3, $4, $4)`,
        [uuid, rawSerial, specsJson, ts]
      );
      await client.query(
        `INSERT INTO item_relations ("ParentItemUUID","ChildItemUUID","RelationType","SlotKey","CreatedAt","UpdatedAt")
         VALUES ($1, $2, 'Zerlegt_aus', $3, NOW(), NOW())`,
        [parentUUID, uuid, slotKey || null]
      );

      if (deps.logEvent) {
        await deps.logEvent({
          Actor: 'intake-station',
          EntityType: 'Item',
          EntityId: parentUUID,
          Event: 'ComponentDetected',
          Meta: JSON.stringify({ childItemUUID: uuid, kind: comp.kind ?? null, serial: rawSerial, slotKey: slotKey || null }),
        });
      }
      result.created.push({ itemUUID: uuid, serial: rawSerial, slotKey });
    }
  });

  return result;
}
