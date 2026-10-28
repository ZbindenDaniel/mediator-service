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
type AdminTier = 'tenant-admin' | 'super-admin';

export default function AdminPage() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('adminSecret') ?? '');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  // Tier drives the panel split (§7 M1): tenant admins see the operational cards; the deployment-wide
  // sections (orgs, taxonomy, printers, ERP, Shopware) are super-admin only. Default super-admin so a
  // network error / local dev shows the full panel, matching the server staying open there.
  const [tier, setTier] = useState<AdminTier>('super-admin');

  useEffect(() => {
    async function probe() {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        // Probe the tenant-admin-tier endpoint so a tenant admin is admitted to the panel; the tier
        // in the body decides which sections render.
        const res = await fetch('/api/admin/access', { headers });
        if (res.status === 401) {
          setAuthStatus('locked');
        } else if (res.status === 403) {
          // Logged in but not any kind of admin: the password can't help, so don't offer the gate.
          setAuthStatus('forbidden');
        } else {
          try {
            const body = await res.json();
            setTier(body?.tier === 'tenant-admin' ? 'tenant-admin' : 'super-admin');
          } catch { setTier('super-admin'); }
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

  // Deployment-wide controls (orgs, taxonomy, printer config, ERP/Shopware wiring) are super-admin
  // only (§7 M1); tenant admins get the operational cards. The server enforces this on each endpoint.
  const isSuper = tier === 'super-admin';

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Administration</h1>
      </div>
      {isSuper && (
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
      )}
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
          {/* Label queue is operational (tenant-admin); printer config is deployment-wide (super-admin). */}
          <PrintQueueCard authToken={token} onAuthFailure={handleAuthFailure} />
          {isSuper && <PrinterQueuesCard authToken={token} onAuthFailure={handleAuthFailure} />}
          {isSuper && <PrinterSettingsCard authToken={token} onAuthFailure={handleAuthFailure} />}
        </Feature>
        <Feature name="agentic">
          <AgenticOverviewCard />
          <AgenticDispatchCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
        <Feature name="admin-system-status">
          <SystemStatusCard authToken={token} onAuthFailure={handleAuthFailure} />
        </Feature>
        {isSuper && (
          <Feature name="erp-sync">
            <NightlyErpSyncCard authToken={token} onAuthFailure={handleAuthFailure} />
          </Feature>
        )}
        {isSuper && (
          <Feature name="shopware">
            <ShopwareStatusCard authToken={token} onAuthFailure={handleAuthFailure} />
          </Feature>
        )}
      </div>
    </div>
  );
}
