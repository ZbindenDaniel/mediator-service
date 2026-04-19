import React, { ReactNode } from 'react';
import Header from './Header';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="layout">
      <Header />
      <main>
        <div className="app-shell">
          <div className="panel-main">{children}</div>
          <div className="app-shell__right">
            <div className="panel-detail" />
            <div className="panel-action" />
          </div>
        </div>
      </main>
    </div>
  );
}
