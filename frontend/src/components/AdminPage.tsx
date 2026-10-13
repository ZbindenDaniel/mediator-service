import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoOrganization, GoTag } from 'react-icons/go';
import ImportCard from './ImportCard';
import ShelfCreateForm from './ShelfCreateForm';
import ExportCard from './admin/ExportCard';
import PrintQueueCard from './admin/PrintQueueCard';
import PrinterQueuesCard from './admin/PrinterQueuesCard';
import PrinterSettingsCard from './admin/PrinterSettingsCard';
import AgenticOverviewCard from './admin/AgenticOverviewCard';
import SystemStatusCard from './admin/SystemStatusCard';
import NightlyErpSyncCard from './admin/NightlyErpSyncCard';
import ShopwareStatusCard from './admin/ShopwareStatusCard';
import AgenticDispatchCard from './admin/AgenticDispatchCard';
import AdminGate from './admin/AdminGate';
import { Feature } from '../context/FeaturesContext';

type AuthStatus = 'checking' | 'ok' | 'locked' | 'forbidden';

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
        } else if (res.status === 403) {
          // Logged in but not an admin: the password can't help, so don't offer the gate.
          setAuthStatus('forbidden');
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

  if (authStatus === 'forbidden') {
    return (
      <div className="admin-page">
        <h1 className="admin-page__title">Administration</h1>
        <p className="muted">Kein Zugriff. Die Administration ist Plattform-Administratoren vorbehalten.</p>
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
      <div className="admin-page__header">
        <h1 className="admin-page__title">Administration</h1>
      </div>
      <nav className="admin-page__nav" aria-label="Verwaltungsbereiche">
        <Link className="admin-link" to="/admin/organisationen">
          <GoOrganization aria-hidden="true" /> Organisationen verwalten
        </Link>
        <Feature name="admin-taxonomy">
          <Link className="admin-link" to="/admin/taxonomy">
            <GoTag aria-hidden="true" /> Taxonomie verwalten
          </Link>
        </Feature>
      </nav>
      {/* Each card sits behind the feature it belongs to; cards without a subsystem have their own admin-* flag. */}
      <div className="admin-page__grid">
        <Feature name="import-export">
          <ImportCard />
          <ExportCard />
        </Feature>
        <Feature name="admin-shelf-create">
          <ShelfCreateForm />
        </Feature>
        <Feature name="printing">
          <PrintQueueCard authToken={token} onAuthFailure={handleAuthFailure} />
          <PrinterQueuesCard authToken={token} onAuthFailure={handleAuthFailure} />
          <PrinterSettingsCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
        <Feature name="agentic">
          <AgenticOverviewCard />
          <AgenticDispatchCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
        <Feature name="admin-system-status">
          <SystemStatusCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
        <Feature name="erp-sync">
          <NightlyErpSyncCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
        <Feature name="shopware">
          <ShopwareStatusCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
      </div>
    </div>
  );
}
