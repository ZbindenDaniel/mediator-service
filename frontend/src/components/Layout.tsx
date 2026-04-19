import React, { ReactNode } from 'react';
import Header from './Header';
import { usePanelContext } from '../context/PanelContext';
import { ItemActionsProvider } from '../context/ItemActionsContext';
import ItemDetail from './ItemDetail';
import DetailTabBar from './DetailTabBar';
import ActionPanel from './panels/ActionPanel';

export default function Layout({ children }: { children: ReactNode }) {
  const { entityType, entityId } = usePanelContext();

  return (
    <div className="layout">
      <Header />
      <main>
        <div className="app-shell">
          <div className="panel-main">{children}</div>
          <div className="app-shell__right">
            {/* ItemActionsProvider wraps both panels so ItemDetail (writer) and ActionPanel (reader) share the same context */}
            <ItemActionsProvider>
              <div className="panel-detail">
                {entityType === 'item' && entityId ? (
                  <>
                    <DetailTabBar />
                    <div className="panel-detail__body">
                      <ItemDetail itemId={entityId} />
                    </div>
                  </>
                ) : null}
              </div>
              <div className="panel-action">
                <ActionPanel />
              </div>
            </ItemActionsProvider>
          </div>
        </div>
      </main>
    </div>
  );
}
