import React from 'react';
import { usePanelContext } from '../../context/PanelContext';
import { useItemActions, type ItemActions } from '../../context/ItemActionsContext';
import PrintLabelButton from '../PrintLabelButton';

export default function ActionPanel() {
  const { entityType, activeTab, entityId } = usePanelContext();
  const actions = useItemActions();

  if (!entityType || !entityId) return null;

  const tab = activeTab ?? 'reference';

  if (entityType === 'item') {
    return <ItemActionPanel tab={tab} entityId={entityId} actions={actions} />;
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
