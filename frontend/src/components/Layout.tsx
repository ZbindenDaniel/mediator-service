import React, { ReactNode, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import { usePanelContext } from '../context/PanelContext';
import { BulkSelectionProvider, useBulkSelection } from '../context/BulkSelectionContext';
import ItemDetail from './ItemDetail';
import BoxDetail from './BoxDetail';
import ItemCreate from './ItemCreate';
import MultiItemSummary from './MultiItemSummary';
import BulkItemActionBar from './BulkItemActionBar';
import { getUser } from '../lib/user';
import OverviewPanel from './OverviewPanel';

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
  const { entityType, entityId, activeTab, multiSelection, setEntity, clearSelection, mobileShowDetail, setMobileShowDetail, loadRevision, panelDetailLabel } = usePanelContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!getUser() && !pathname.startsWith('/hilfe') && !pathname.startsWith('/admin')) {
      navigate('/hilfe?doc=Erste-Schritte', { replace: true });
    }
  // only run on mount — pathname intentionally excluded to avoid redirect loops during navigation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div className={`app-shell${mobileShowDetail ? ' app-shell--mobile-detail' : ' app-shell--mobile-list'}`}>
            <div className="panel-main">{children}</div>
            <div className="app-shell__right">
              {hasEntity && !isCreateMode && (
                <div className="panel-detail-header">
                  <button type="button" className="panel-detail-header__back" onClick={() => { setMobileShowDetail(false); clearSelection(); }}>
                    <span className="panel-detail-header__arrow" aria-hidden="true">←</span>
                    <span>Liste</span>
                  </button>
                  {panelDetailLabel && (
                    <span className="panel-detail-header__label" title={panelDetailLabel}>
                      {panelDetailLabel}
                    </span>
                  )}
                </div>
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
                    <ItemDetail key={`${entityId}-${loadRevision}`} itemId={entityId} />
                  ) : entityType === 'box' && entityId ? (
                    <BoxDetail key={`${entityId}-${loadRevision}`} boxId={entityId} />
                  ) : (
                    <div className="panel-tab-body">
                      <OverviewPanel />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </BulkSelectionProvider>
      </main>
    </div>
  );
}
