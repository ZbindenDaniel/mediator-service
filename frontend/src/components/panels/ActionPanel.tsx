import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePanelContext } from '../../context/PanelContext';
import { useItemActions, type ItemActions } from '../../context/ItemActionsContext';
import { useBoxActions, type BoxActions } from '../../context/BoxActionsContext';
import { useBulkSelection } from '../../context/BulkSelectionContext';
import BulkItemActionBar from '../BulkItemActionBar';
import PrintLabelButton from '../PrintLabelButton';
import SearchCard from '../SearchCard';
import StatsCard from '../StatsCard';
import type { AgenticRunStatus } from '../../../../models';

export default function ActionPanel() {
  const { entityType, activeTab, entityId, multiSelection } = usePanelContext();
  const actions = useItemActions();
  const boxActions = useBoxActions();
  const bulk = useBulkSelection();

  // Multi-item selection takes priority.
  if (multiSelection?.length && bulk) {
    return (
      <BulkItemActionBar
        selectedIds={multiSelection}
        selectedItems={bulk.selectedItems}
        onClearSelection={bulk.onClearSelection}
        onActionComplete={bulk.onActionComplete}
      />
    );
  }

  if (!entityType || !entityId) {
    return <NoSelectionPanel />;
  }

  const tab = activeTab ?? 'reference';

  if (entityType === 'item') {
    return <ItemActionPanel tab={tab} entityId={entityId} actions={actions} />;
  }

  if (entityType === 'box') {
    return <BoxActionPanel tab={activeTab ?? 'info'} entityId={entityId} boxActions={boxActions} />;
  }

  return null;
}

// ── No-selection panel: search + stats ──────────────────────────────────────

interface DashboardData {
  counts?: { boxes: number; items: number; itemsNoBox: number };
  agentic?: { stateCounts?: Partial<Record<AgenticRunStatus, number>>; enrichedItems?: number };
  printerOk: boolean | null;
  printerReason: string | null;
  health: string;
}

function NoSelectionPanel() {
  const [data, setData] = useState<DashboardData>({ printerOk: null, printerReason: null, health: 'prüfe…' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [overviewRes, printerRes, healthRes] = await Promise.all([
          fetch('/api/overview'),
          fetch('/api/printer/status'),
          fetch('/api/health')
        ]);
        if (cancelled) return;
        const overview = overviewRes.ok ? await overviewRes.json() : null;
        const printer = printerRes.ok ? await printerRes.json() : null;
        const health = healthRes.ok ? await healthRes.json() : null;
        const printerOk = printerRes.ok && printer?.ok === true;
        setData({
          counts: overview?.counts,
          agentic: overview?.agentic,
          printerOk,
          printerReason: printerOk ? null : (printer?.reason ?? null),
          health: healthRes.ok && health?.ok ? 'ok' : (health?.reason || 'nicht erreichbar'),
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="action-panel__content">
      <SearchCard />
      <StatsCard
        counts={data.counts}
        printerOk={data.printerOk}
        printerReason={data.printerReason}
        health={data.health}
        agentic={data.agentic}
      />
    </div>
  );
}

// ── Item action panel ────────────────────────────────────────────────────────

interface ItemActionPanelProps {
  tab: string;
  entityId: string;
  actions: ItemActions | null;
}

function ItemActionPanel({ tab, entityId, actions }: ItemActionPanelProps) {
  const navigate = useNavigate();

  switch (tab) {
    case 'reference': {
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn"
            onClick={() => actions?.onEdit?.()}
          >
            Bearbeiten
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate(`/items/${encodeURIComponent(entityId)}/edit`)}
          >
            Shopstatus
          </button>
          {(actions?.agenticCanStart || actions?.agenticCanRestart) && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={Boolean(actions?.agenticActionPending)}
              onClick={() => void actions?.onStart?.()}
            >
              KI-Sync
            </button>
          )}
          <div className="action-panel__nav-row">
            <button
              type="button"
              className="btn"
              disabled={!actions?.neighborIds?.previousId || actions?.neighborsLoading}
              onClick={() => actions?.onNeighborNav?.('previous')}
              aria-label="Vorheriger Artikel"
            >
              ← Vorheriger
            </button>
            <button
              type="button"
              className="btn"
              disabled={!actions?.neighborIds?.nextId || actions?.neighborsLoading}
              onClick={() => actions?.onNeighborNav?.('next')}
              aria-label="Nächster Artikel"
            >
              Nächster →
            </button>
          </div>
        </div>
      );
    }

    case 'ki': {
      const pending = Boolean(actions?.agenticActionPending);
      return (
        <div className="action-panel__content">
          {(actions?.agenticCanStart || actions?.agenticCanRestart) && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={pending}
              onClick={() => void actions?.onStart?.()}
            >
              {actions?.startLabel ?? 'Starten'}
            </button>
          )}
          {actions?.agenticCanCancel && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => void actions?.onCancel?.()}
            >
              Abbrechen
            </button>
          )}
          {actions?.agenticCanClose && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => void actions?.onClose?.()}
            >
              Abschliessen
            </button>
          )}
          {actions?.agenticCanDelete && (
            <button
              type="button"
              className="btn btn--danger"
              disabled={pending}
              onClick={() => void actions?.onDelete?.()}
            >
              Löschen
            </button>
          )}
          <div className="action-panel__nav-row">
            <button
              type="button"
              className="btn"
              disabled={!actions?.neighborIds?.previousId || actions?.neighborsLoading}
              onClick={() => actions?.onNeighborNav?.('previous')}
            >
              ←
            </button>
            <button
              type="button"
              className="btn"
              disabled={!actions?.neighborIds?.nextId || actions?.neighborsLoading}
              onClick={() => actions?.onNeighborNav?.('next')}
            >
              →
            </button>
          </div>
        </div>
      );
    }

    case 'instance': {
      return (
        <div className="action-panel__content">
          <PrintLabelButton itemId={entityId} />
          <button
            type="button"
            className="btn"
            onClick={() => actions?.onStartRelocate?.()}
          >
            Umlagern
          </button>
        </div>
      );
    }

    case 'review': {
      if (!actions?.agenticNeedsReview) return null;
      const pending = Boolean(actions?.agenticActionPending);
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn btn--primary"
            disabled={pending}
            onClick={() => void actions?.onReview?.()}
          >
            Review durchführen
          </button>
          {actions?.agenticCanCancel && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => void actions?.onCancel?.()}
            >
              Lauf abbrechen
            </button>
          )}
        </div>
      );
    }

    // images, attachments, accessories, events: no action panel needed
    default:
      return null;
  }
}

// ── Box action panel ─────────────────────────────────────────────────────────

interface BoxActionPanelProps {
  tab: string;
  entityId: string;
  boxActions: BoxActions | null;
}

function BoxActionPanel({ tab, entityId, boxActions }: BoxActionPanelProps) {
  const navigate = useNavigate();

  switch (tab) {
    case 'info':
      return (
        <div className="action-panel__content">
          <PrintLabelButton boxId={entityId} />
          <button
            type="button"
            className="btn"
            onClick={() => navigate(`/boxes/${encodeURIComponent(entityId)}/edit`)}
          >
            Bearbeiten
          </button>
        </div>
      );

    case 'items': {
      if (!boxActions?.onAddItem) return null;
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => boxActions.onAddItem?.()}
          >
            Artikel hinzufügen
          </button>
        </div>
      );
    }

    case 'images': {
      if (!boxActions?.onUploadImage) return null;
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => boxActions.onUploadImage?.()}
          >
            Foto hochladen
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
