import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePanelContext } from '../../context/PanelContext';
import { useItemActions, type ItemActions } from '../../context/ItemActionsContext';
import { useBulkSelection } from '../../context/BulkSelectionContext';
import BulkItemActionBar from '../BulkItemActionBar';
import PrintLabelButton from '../PrintLabelButton';

export default function ActionPanel() {
  const { entityType, activeTab, entityId, multiSelection } = usePanelContext();
  const actions = useItemActions();
  const bulk = useBulkSelection();

  // Multi-item selection takes priority: render bulk action bar in the action panel.
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

  if (!entityType || !entityId) return null;

  const tab = activeTab ?? 'reference';

  if (entityType === 'item') {
    return <ItemActionPanel tab={tab} entityId={entityId} actions={actions} />;
  }

  if (entityType === 'box') {
    return <BoxActionPanel tab={activeTab ?? 'info'} entityId={entityId} />;
  }

  return null;
}

interface ItemActionPanelProps {
  tab: string;
  entityId: string;
  actions: ItemActions | null;
}

function ItemActionPanel({ tab, entityId, actions }: ItemActionPanelProps) {
  switch (tab) {
    case 'reference': {
      if (!actions?.agenticCanStart && !actions?.agenticCanRestart) return null;
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn btn--primary"
            disabled={Boolean(actions?.agenticActionPending)}
            onClick={() => void actions?.onStart?.()}
          >
            {actions?.startLabel ?? 'KI-Lauf'}
          </button>
        </div>
      );
    }

    case 'instance': {
      return (
        <div className="action-panel__content">
          <PrintLabelButton itemId={entityId} />
        </div>
      );
    }

    case 'review': {
      if (!actions?.agenticNeedsReview) return null;
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn btn--primary"
            disabled={Boolean(actions?.agenticActionPending)}
            onClick={() => void actions?.onReview?.()}
          >
            Review durchführen
          </button>
          {actions?.agenticCanCancel && (
            <button
              type="button"
              className="btn"
              disabled={Boolean(actions?.agenticActionPending)}
              onClick={() => void actions?.onCancel?.()}
            >
              Lauf abbrechen
            </button>
          )}
        </div>
      );
    }

    // images, attachments, accessories, events: actions wired in a later step
    default:
      return null;
  }
}

interface BoxActionPanelProps {
  tab: string;
  entityId: string;
}

function BoxActionPanel({ tab, entityId }: BoxActionPanelProps) {
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

    // items, images, events, stubs: actions require BoxDetail internal state — wired in a later step
    default:
      return null;
  }
}
