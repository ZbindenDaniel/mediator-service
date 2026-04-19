import React, { ReactNode } from 'react';
import Header from './Header';
import { usePanelContext } from '../context/PanelContext';
import ItemDetail from './ItemDetail';

export default function Layout({ children }: { children: ReactNode }) {
  const { entityType, entityId } = usePanelContext();

  return (
    <div className="layout">
      <Header />
      <main>
        <div className="app-shell">
          <div className="panel-main">{children}</div>
          <div className="app-shell__right">
            <div className="panel-detail">
              {entityType === 'item' && entityId ? (
                <ItemDetail itemId={entityId} />
              ) : null}
            </div>
            <div className="panel-action" />
          </div>
        </div>
      </main>
    </div>
  );
}
