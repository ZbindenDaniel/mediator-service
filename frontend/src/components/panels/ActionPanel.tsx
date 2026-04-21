import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePanelContext } from '../../context/PanelContext';
import { useItemActions, type ItemActions } from '../../context/ItemActionsContext';
import { useBoxActions, type BoxActions } from '../../context/BoxActionsContext';
import { useBulkSelection } from '../../context/BulkSelectionContext';
import BulkItemActionBar from '../BulkItemActionBar';
import PrintLabelButton from '../PrintLabelButton';

export default function ActionPanel() {
  const { entityType, activeTab, entityId, multiSelection } = usePanelContext();
  const actions = useItemActions();
  const boxActions = useBoxActions();
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
    return <BoxActionPanel tab={activeTab ?? 'info'} entityId={entityId} boxActions={boxActions} />;
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
    case 'reference':
    case 'ki': {
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

    case 'images': {
      if (!actions?.onUploadImage) return null;
      return (
        <div className="action-panel__content">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => actions.onUploadImage?.()}
          >
            Bild hochladen
          </button>
        </div>
      );
    }

    // attachments, accessories, events: inline controls in tab already cover these
    default:
      return null;
  }
}

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

    // events, stubs: no actions needed
    default:
      return null;
  }
}
