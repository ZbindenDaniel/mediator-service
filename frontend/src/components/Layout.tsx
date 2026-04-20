import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { usePanelContext } from '../context/PanelContext';
import { ItemActionsProvider } from '../context/ItemActionsContext';
import { BoxActionsProvider } from '../context/BoxActionsContext';
import { BulkSelectionProvider, useBulkSelection } from '../context/BulkSelectionContext';
import ItemDetail from './ItemDetail';
import BoxDetail from './BoxDetail';
import ItemCreate from './ItemCreate';
import DetailTabBar from './DetailTabBar';
import ActionPanel from './panels/ActionPanel';
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
        {/* BulkSelectionProvider wraps the whole shell so ItemListPage (main) and ActionPanel (right) share selection data */}
        <BulkSelectionProvider>
          <div className="app-shell">
            <div className="panel-main">{children}</div>
            <div className="app-shell__right">
              {isCreateMode ? (
                // Merge detail + action slots into a single tall creation panel
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
                /* ItemActionsProvider wraps both panels so ItemDetail (writer) and ActionPanel (reader) share the same context */
                <ItemActionsProvider>
                <BoxActionsProvider>
                  <div className="panel-detail">
                    {hasMultiSelection ? (
                      <MultiItemDetailPanel />
                    ) : entityType === 'item' && entityId ? (
                      <>
                        <DetailTabBar />
                        <div className="panel-detail__body">
                          <ItemDetail itemId={entityId} />
                        </div>
                      </>
                    ) : entityType === 'box' && entityId ? (
                      <>
                        <DetailTabBar />
                        <div className="panel-detail__body">
                          <BoxDetail boxId={entityId} />
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="panel-action">
                    <ActionPanel />
                  </div>
                </BoxActionsProvider>
                </ItemActionsProvider>
              )}
            </div>
          </div>
        </BulkSelectionProvider>
      </main>
    </div>
  );
}
