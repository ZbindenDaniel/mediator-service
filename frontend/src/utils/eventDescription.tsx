import React from 'react';
import type { EventLog } from '../../../models';
import { eventLabel } from '../../../models/event-labels';

function safeParseMeta(meta: unknown): Record<string, unknown> {
  if (!meta) return {};
  if (typeof meta === 'object') return meta as Record<string, unknown>;
  try { return JSON.parse(String(meta)) as Record<string, unknown>; } catch { return {}; }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Same wording as the KI-cockpit lever labels (PipelineCockpit.tsx), so log and UI read alike.
const AGENTIC_FLAG_LABELS: Record<string, string> = {
  autoApprove: 'Auto-Freigabe',
  autoRework: 'Auto-Rework',
  autoReview: 'Auto-Review'
};

function describeShopChanges(meta: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const shop = num(meta.shopartikel);
  if (shop !== null) parts.push(shop ? 'Shopartikel' : 'kein Shopartikel');
  const published = str(meta.veröffentlichtStatus);
  if (published) parts.push(published === 'yes' ? 'veröffentlicht' : published === 'no' ? 'nicht veröffentlicht' : published);
  const price = num(meta.verkaufspreis);
  if (price !== null) parts.push(`CHF ${price.toFixed(2)}`);
  return parts.length ? parts.join(', ') : null;
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

    case 'ShopStatusBulkUpdated': {
      const references = num(meta.references);
      const changes = describeShopChanges(meta);
      if (references !== null) {
        return <>Shop-Status für {references} {references === 1 ? 'Referenz' : 'Referenzen'} gesetzt{changes ? <> ({changes})</> : null}</>;
      }
      break;
    }

    case 'ShopStatusUpdated': {
      const changes = describeShopChanges(meta);
      if (changes) return <>Shop-Status aktualisiert ({changes})</>;
      break;
    }

    case 'AgenticBulkQueued': {
      const queued = num(meta.queued);
      const skipped = num(meta.skipped);
      const restart = meta.mode === 'bulk-restart-failed';
      if (queued !== null) {
        return (
          <>
            {restart ? 'Fehlgeschlagene KI-Läufe neu gestartet' : 'KI-Suche eingeplant'}: {queued} Artikel
            {skipped ? <> ({skipped} übersprungen)</> : null}
          </>
        );
      }
      break;
    }

    case 'AgenticRunFailed':
    case 'AgenticResultFailed': {
      const reason = str(meta.error) ?? str(meta.Error) ?? str(meta.reason);
      if (reason) return <>{eventLabel(event.Event)}: <span className="muted">{reason}</span></>;
      break;
    }

    case 'PrintFailed': {
      const reason = str(meta.reason);
      if (reason) return <>{eventLabel(event.Event)}: <span className="muted">{reason}</span></>;
      break;
    }

    case 'QualityScoreChanged': {
      const from = str(meta.from);
      const to = str(meta.to);
      if (from || to) return <>Qualität {from ?? '—'} → {to ?? '—'}</>;
      break;
    }

    // --- KI cockpit levers + unattended pipeline actions -----------------------------------------------
    case 'AgenticFlagChanged': {
      const flag = str(meta.flag);
      if (flag && typeof meta.enabled === 'boolean') {
        return <>{AGENTIC_FLAG_LABELS[flag] ?? flag} {meta.enabled ? 'eingeschaltet' : 'ausgeschaltet'}</>;
      }
      break;
    }

    case 'AgenticDispatchToggled': {
      if (typeof meta.enabled === 'boolean') {
        return <>Auto-Verteilung {meta.enabled ? 'eingeschaltet' : 'gestoppt'}</>;
      }
      break;
    }

    case 'AgenticSelfHealTriggered': {
      const enqueued = num(meta.enqueued) ?? 0;
      const restamped = num(meta.restamped) ?? 0;
      const stale = num(meta.staleCount);
      if (enqueued === 0 && restamped === 0) {
        const reason = str(meta.reason);
        return <>Self-Heal ausgelöst: keine Aktion{reason ? <> <span className="muted">({reason})</span></> : null}</>;
      }
      const parts: string[] = [];
      if (enqueued) parts.push(`${enqueued} eingereiht`);
      if (restamped) parts.push(`${restamped} neu gestempelt`);
      return <>Self-Heal ausgelöst: {parts.join(', ')}{stale !== null ? <span className="muted"> · {stale} veraltet</span> : null}</>;
    }

    case 'AgenticRunRestarted': {
      const fields = Array.isArray(meta.reworkSpecFields)
        ? (meta.reworkSpecFields as unknown[]).filter((f): f is string => typeof f === 'string')
        : [];
      const fromCockpit = meta.source === 'cockpit';
      if (meta.validateOnly === true) {
        return <>KI-Prüfung ohne Suche eingereiht{fromCockpit ? ' (KI-Cockpit)' : ''}</>;
      }
      if (fields.length) {
        return <>KI-Überarbeitung von <code>{fields.join(', ')}</code> eingereiht{fromCockpit ? ' (KI-Cockpit)' : ''}</>;
      }
      if (fromCockpit) return <>{eventLabel(event.Event)} (KI-Cockpit)</>;
      break;
    }

    case 'ContractAuditRework': {
      const missing = Array.isArray(meta.missingRequired)
        ? (meta.missingRequired as unknown[]).filter((f): f is string => typeof f === 'string')
        : [];
      if (missing.length) return <>Self-Heal: fehlende Pflichtfelder neu erzeugt (<code>{missing.join(', ')}</code>)</>;
      break;
    }

    case 'StandardsAuditReword':
    case 'PendingReviewSelfHeal': {
      const to = meta.standardsToVersion;
      if (typeof to === 'string' || typeof to === 'number') {
        return <>{eventLabel(event.Event)} <span className="muted">(Standard v{String(to)})</span></>;
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
