import React from 'react';
import type { EventLog } from '../../../models';
import { eventLabel } from '../../../models/event-labels';

function safeParseMeta(meta: string | null | undefined): Record<string, unknown> {
  if (!meta) return {};
  try { return JSON.parse(meta) as Record<string, unknown>; } catch { return {}; }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function formatEventDescription(event: EventLog): React.ReactNode {
  const meta = safeParseMeta(event.Meta);

  switch (event.Event) {
    case 'Moved': {
      if (event.EntityType === 'Item') {
        const from = str(meta.from);
        const to = str(meta.to);
        if (from || to) {
          return (
            <>
              Umgelagert
              {from ? <> von <code>{from}</code></> : null}
              {to ? <> nach <code>{to}</code></> : null}
            </>
          );
        }
      }
      if (event.EntityType === 'Box') {
        const label = str(meta.label);
        const locationId = str(meta.locationId);
        const dest = label || locationId;
        if (dest) {
          return <>Verschoben nach <code>{dest}</code></>;
        }
      }
      break;
    }

    case 'Removed': {
      const fromBox = str(meta.fromBox);
      const before = num(meta.before) ?? num(meta.quantityBefore);
      const after = num(meta.after) ?? num(meta.quantityAfter);
      if (fromBox) {
        if (before !== null && after !== null && before !== after) {
          return <>Entnommen aus <code>{fromBox}</code> ({before} → {after})</>;
        }
        return <>Entnommen aus <code>{fromBox}</code></>;
      }
      break;
    }

    case 'AgenticReviewApproved':
    case 'AgenticReviewRejected':
    case 'AgenticReviewSubmitted': {
      const reviewedBy = str(meta.reviewedBy);
      const base = eventLabel(event.Event);
      if (reviewedBy) {
        return <>{base} von {reviewedBy}</>;
      }
      break;
    }

    case 'RemovedFromDevice': {
      const parentUuid = str(meta.parentUuid);
      const toBoxId = str(meta.toBoxId);
      if (parentUuid || toBoxId) {
        return (
          <>
            Vom Gerät entfernt
            {parentUuid ? <> (Gerät <code>{parentUuid}</code>)</> : null}
            {toBoxId ? <> → <code>{toBoxId}</code></> : null}
          </>
        );
      }
      break;
    }

    case 'SparePartRemoved': {
      const toBoxId = str(meta.toBoxId);
      if (toBoxId) {
        return <>Ersatzteil entnommen → <code>{toBoxId}</code></>;
      }
      break;
    }

    case 'SparepartsRemovedWithDevice': {
      const removedCount = num(meta.removedCount);
      if (removedCount !== null) {
        return <>Ersatzteile mit Gerät entfernt ({removedCount} {removedCount === 1 ? 'Teil' : 'Teile'})</>;
      }
      break;
    }

    case 'SparePartCataloged': {
      const artikelNummer = str(meta.artikelNummer);
      if (artikelNummer) {
        return <>Ersatzteil katalogisiert (<code>{artikelNummer}</code>)</>;
      }
      break;
    }
  }

  return eventLabel(event.Event);
}
