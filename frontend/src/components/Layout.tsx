import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { usePanelContext } from '../context/PanelContext';
import { BulkSelectionProvider, useBulkSelection } from '../context/BulkSelectionContext';
import ItemDetail from './ItemDetail';
import BoxDetail from './BoxDetail';
import ItemCreate from './ItemCreate';
import DetailTabBar from './DetailTabBar';
import MultiItemSummary from './MultiItemSummary';

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
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { entityType, entityId, activeTab, multiSelection, setEntity, clearSelection } = usePanelContext();
  const navigate = useNavigate();

  // Create mode: entityType=item, entityId=null, activeTab=create
  const isCreateMode = entityType === 'item' && entityId === null && activeTab === 'create';
  const hasMultiSelection = Boolean(multiSelection?.length);

  return (
    <div className="layout">
      <Header />
      <main>
        <BulkSelectionProvider>
          <div className="app-shell">
            <div className="panel-main">{children}</div>
            <div className="app-shell__right">
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
                    // DetailTabBar is rendered inside ItemDetail so it can pass agenticNeedsReview directly
                    <ItemDetail itemId={entityId} />
                  ) : entityType === 'box' && entityId ? (
                    <>
                      <DetailTabBar />
                      <div className="panel-detail__body">
                        <BoxDetail boxId={entityId} />
                      </div>
                    </>
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
