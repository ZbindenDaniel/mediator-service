import React, { useEffect, useState } from 'react';
import ImportCard from './ImportCard';
import ShelfCreateForm from './ShelfCreateForm';
import ExportCard from './admin/ExportCard';
import PrintQueueCard from './admin/PrintQueueCard';
import PrinterQueuesCard from './admin/PrinterQueuesCard';
import WorkerNodesCard from './admin/WorkerNodesCard';
import PrinterSettingsCard from './admin/PrinterSettingsCard';
import AgenticOverviewCard from './admin/AgenticOverviewCard';
import SystemStatusCard from './admin/SystemStatusCard';
import NightlyErpSyncCard from './admin/NightlyErpSyncCard';
import AdminGate from './admin/AdminGate';

type AuthStatus = 'checking' | 'ok' | 'locked';

export default function AdminPage() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('adminSecret') ?? '');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');

  useEffect(() => {
    async function probe() {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/admin/config', { headers });
        if (res.status === 401) {
          setAuthStatus('locked');
        } else {
          setAuthStatus('ok');
        }
      } catch {
        // network error — allow access; server gates individual calls
        setAuthStatus('ok');
      }
    }
    void probe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleAuthSuccess(newToken: string) {
    setToken(newToken);
    setAuthStatus('ok');
  }

  function handleAuthFailure() {
    sessionStorage.removeItem('adminSecret');
    setToken('');
    setAuthStatus('locked');
  }

  if (authStatus === 'checking') {
    return (
      <div className="admin-page">
        <h1 className="admin-page__title">Administration</h1>
        <p className="muted">Lade…</p>
      </div>
    );
  }

  if (authStatus === 'locked') {
    return (
      <div className="admin-page">
        <h1 className="admin-page__title">Administration</h1>
        <AdminGate onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page__title">Administration</h1>
      <div className="admin-page__grid">
        <ImportCard />
        <ExportCard />
        <ShelfCreateForm />
        <PrintQueueCard authToken={token} onAuthFailure={handleAuthFailure} />
        <PrinterQueuesCard authToken={token} onAuthFailure={handleAuthFailure} />
        <WorkerNodesCard authToken={token} onAuthFailure={handleAuthFailure} />
        <PrinterSettingsCard authToken={token} onAuthFailure={handleAuthFailure} />
        <AgenticOverviewCard />
        <SystemStatusCard authToken={token} onAuthFailure={handleAuthFailure} />
        <NightlyErpSyncCard authToken={token} onAuthFailure={handleAuthFailure} />
      </div>
    </div>
  );
}
