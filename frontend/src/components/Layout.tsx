import React, { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import { usePanelContext } from '../context/PanelContext';
import { BulkSelectionProvider, useBulkSelection } from '../context/BulkSelectionContext';
import ItemDetail from './ItemDetail';
import BoxDetail from './BoxDetail';
import ItemCreate from './ItemCreate';
import MultiItemSummary from './MultiItemSummary';
import BulkItemActionBar from './BulkItemActionBar';

function MultiItemDetailPanel() {
  const { multiSelection } = usePanelContext();
  const bulk = useBulkSelection();
  if (!multiSelection?.length) return null;
  return (
    <div className="panel-detail__body">
      <MultiItemSummary
        selectedIds={multiSelection}
        selectedItems={bulk?.selectedItems ?? []}
      />
      {bulk && (
        <BulkItemActionBar
          selectedIds={multiSelection}
          selectedItems={bulk.selectedItems}
          onClearSelection={bulk.onClearSelection}
          onActionComplete={bulk.onActionComplete}
        />
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { entityType, entityId, activeTab, multiSelection, setEntity, clearSelection, mobileShowDetail, setMobileShowDetail } = usePanelContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Full-screen routes bypass the two-column shell entirely
  const isFullScreen = pathname.startsWith('/scan') || pathname.startsWith('/placement/');
  if (isFullScreen) {
    return (
      <div className="layout">
        <Header />
        <main>{children}</main>
      </div>
    );
  }

  // Create mode: entityType=item, entityId=null, activeTab=create
  const isCreateMode = entityType === 'item' && entityId === null && activeTab === 'create';
  const hasMultiSelection = Boolean(multiSelection?.length);
  const hasEntity = Boolean((entityType === 'item' || entityType === 'box') && entityId) || isCreateMode || hasMultiSelection;

  return (
    <div className="layout">
      <Header />
      <main>
        <BulkSelectionProvider>
          <div className={`app-shell${mobileShowDetail ? ' app-shell--mobile-detail' : ''}`}>
            <div className="panel-main">{children}</div>
            <div className="app-shell__right">
              {mobileShowDetail && (
                <button type="button" className="mobile-back-btn" onClick={() => setMobileShowDetail(false)}>
                  ← Liste
                </button>
              )}
              {isCreateMode ? (
                <div className="panel-create">
                  <ItemCreate
                    layout="embedded"
                    onSaved={(newItemId) => {
                      setEntity('item', newItemId);
                      navigate('/items');
                    }}
                    onCancel={clearSelection}
                  />
                </div>
              ) : (
                <div className="panel-detail">
                  {hasMultiSelection ? (
                    <MultiItemDetailPanel />
                  ) : entityType === 'item' && entityId ? (
                    <ItemDetail itemId={entityId} />
                  ) : entityType === 'box' && entityId ? (
                    <BoxDetail boxId={entityId} />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </BulkSelectionProvider>
      </main>
    </div>
  );
}
