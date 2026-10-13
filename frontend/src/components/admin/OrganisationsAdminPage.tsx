import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { setShelfLocations } from '../../data/shelfLocations';
import type { SiteDefinition } from '../../data/shelfLocations';

// Organisations admin (docs/PLANNING_TENANCY.md §2a): orgs, their Authentik group link and their
// warehouse sites. Master-detail like the taxonomy page. Users and group membership stay in
// Authentik; here an org is only *linked* to a group by name.

interface Site {
  id: string;
  tenantId: string | null;
  label: string;
  floors: string[];
}
interface Org {
  id: string;
  label: string | null;
  active: boolean;
  contactEmail: string | null;
  authentikGroup: string | null;
  authentikSuperGroup: string | null;
  sites: Site[];
}
interface Snapshot {
  tenants: Org[];
  unassignedSites: Site[];
  platformAdminGroup: string;
}

const UNASSIGNED = '__unassigned__';

function authHeaders(): Record<string, string> {
  const token = (() => { try { return sessionStorage.getItem('adminSecret') ?? ''; } catch { return ''; } })();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const parseFloors = (text: string): string[] => text.split(',').map((f) => f.trim()).filter(Boolean);

export default function OrganisationsAdminPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const apply = useCallback((snap: Snapshot) => {
    setData(snap);
    // Keep the app-wide site list (shelf labels, shelf creation) in step without a reload.
    const all: SiteDefinition[] = [...snap.tenants.flatMap((t) => t.sites), ...snap.unassignedSites];
    setShelfLocations(all);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/tenants', { headers: authHeaders() });
        if (!res.ok) throw new Error(res.status === 403 ? 'Kein Zugriff.' : `HTTP ${res.status}`);
        apply(await res.json());
      } catch (err) {
        setError(`Organisationen konnten nicht geladen werden: ${(err as Error).message}`);
      }
    })();
  }, [apply]);

  const send = useCallback(async (method: string, url: string, body?: unknown): Promise<boolean> => {
    setError(null);
    setMessage('');
    try {
      const res = await fetch(url, { method, headers: authHeaders(), body: body === undefined ? undefined : JSON.stringify(body) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? `HTTP ${res.status}`);
        return false;
      }
      apply(payload as Snapshot);
      setMessage('Gespeichert.');
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [apply]);

  const orgs = data?.tenants ?? [];
  const selected = orgs.find((o) => o.id === selectedId) ?? null;
  const showUnassigned = selectedId === UNASSIGNED;

  return (
    <div className="admin-page">
      <div className="admin-page__header" style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <h1 className="admin-page__title">Organisationen</h1>
        <Link to="/admin">← Administration</Link>
      </div>
      <p className="muted">
        Benutzer und Gruppen werden in Authentik verwaltet. Hier wird eine Organisation über den
        Gruppennamen mit Authentik verknüpft. Plattform-Admins: Gruppe „{data?.platformAdminGroup ?? '…'}“.
      </p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <p className="muted" aria-live="polite">{message}</p>}

      <div className="row" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <h3>Organisationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', cursor: 'pointer',
                    background: o.id === selectedId ? 'var(--surface-selected, #eef)' : 'transparent',
                    opacity: o.active ? 1 : 0.5
                  }}
                >
                  <strong>{o.label ?? o.id}</strong>{!o.active ? ' (inaktiv)' : ''}
                  <span className="muted"> · {o.sites.length} Standorte{o.authentikGroup ? '' : ' · keine Gruppe'}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setSelectedId(UNASSIGNED)}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', cursor: 'pointer',
                  background: showUnassigned ? 'var(--surface-selected, #eef)' : 'transparent'
                }}
              >
                <em>Standorte ohne Organisation</em>
                <span className="muted"> · {data?.unassignedSites.length ?? 0}</span>
              </button>
            </li>
          </ul>
          <AddOrgForm onAdd={async (body) => {
            if (await send('POST', '/api/admin/tenants', body)) setSelectedId(body.id);
          }} />
        </div>

        <div className="card" style={{ flex: '2 1 360px' }}>
          {selected ? (
            <>
              <h3>{selected.label ?? selected.id} <span className="muted">({selected.id})</span></h3>
              <OrgEditor key={selected.id} org={selected} onSave={(patch) => send('PUT', `/api/admin/tenants/${encodeURIComponent(selected.id)}`, patch)} />
              <h4>Standorte</h4>
              <SiteList sites={selected.sites} orgs={orgs} send={send} />
              <AddSiteForm tenantId={selected.id} onAdd={(body) => send('POST', '/api/admin/sites', body)} />
            </>
          ) : showUnassigned ? (
            <>
              <h3>Standorte ohne Organisation</h3>
              <p className="muted">Für alle nutzbar. Einer Organisation zuweisen, sobald sie ihre eigenen Standorte hat.</p>
              <SiteList sites={data?.unassignedSites ?? []} orgs={orgs} send={send} />
              <AddSiteForm tenantId={null} onAdd={(body) => send('POST', '/api/admin/sites', body)} />
            </>
          ) : (
            <p className="muted">Organisation auswählen oder neu anlegen.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AddOrgForm({ onAdd }: { onAdd: (body: { id: string; label: string; authentikGroup: string }) => Promise<void> }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState('');
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border,#ddd)', paddingTop: 8, display: 'grid', gap: 6 }}>
      <strong className="muted">Neue Organisation</strong>
      <input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="ID (z.B. zurichrepair), nicht änderbar" />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" />
      <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Authentik-Gruppe (z.B. tenant-zurichrepair)" />
      <button type="button" disabled={!id || !label} onClick={() => void onAdd({ id: id.trim(), label: label.trim(), authentikGroup: group.trim() }).then(() => { setId(''); setLabel(''); setGroup(''); })}>
        Anlegen
      </button>
    </div>
  );
}

function OrgEditor({ org, onSave }: { org: Org; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const [label, setLabel] = useState(org.label ?? '');
  const [contactEmail, setContactEmail] = useState(org.contactEmail ?? '');
  const [group, setGroup] = useState(org.authentikGroup ?? '');
  const [superGroup, setSuperGroup] = useState(org.authentikSuperGroup ?? '');
  const [active, setActive] = useState(org.active);
  return (
    <div style={{ display: 'grid', gap: 6, maxWidth: 480 }}>
      <label className="dialog-field"><span>Name</span><input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="dialog-field"><span>Kontakt-E-Mail (für Bestellungen)</span><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></label>
      <label className="dialog-field"><span>Authentik-Gruppe (Benutzer)</span><input value={group} onChange={(e) => setGroup(e.target.value)} /></label>
      <label className="dialog-field"><span>Authentik-Gruppe (Organisations-Admins, optional)</span><input value={superGroup} onChange={(e) => setSuperGroup(e.target.value)} /></label>
      <label className="dialog-field dialog-field--checkbox"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Aktiv (inaktiv = Logins dieser Gruppe gehören zu keiner Organisation)</span></label>
      <button type="button" onClick={() => void onSave({ label, contactEmail, authentikGroup: group, authentikSuperGroup: superGroup, active })}>
        Speichern
      </button>
    </div>
  );
}

function SiteList({ sites, orgs, send }: {
  sites: Site[];
  orgs: Org[];
  send: (method: string, url: string, body?: unknown) => Promise<boolean>;
}) {
  if (sites.length === 0) return <p className="muted">Keine Standorte.</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {sites.map((s) => <SiteEditor key={`${s.id}-${s.tenantId}`} site={s} orgs={orgs} send={send} />)}
    </div>
  );
}

function SiteEditor({ site, orgs, send }: {
  site: Site;
  orgs: Org[];
  send: (method: string, url: string, body?: unknown) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(site.label);
  const [floors, setFloors] = useState(site.floors.join(', '));
  const [tenantId, setTenantId] = useState(site.tenantId ?? '');
  const url = `/api/admin/sites/${encodeURIComponent(site.id)}`;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border,#ddd)', paddingTop: 6 }}>
      <strong style={{ minWidth: 60 }}>{site.id}</strong>
      <input aria-label={`Bezeichnung ${site.id}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bezeichnung" />
      <input aria-label={`Stockwerke ${site.id}`} value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="Stockwerke, z.B. 0, 1" style={{ width: 120 }} />
      <select aria-label={`Organisation ${site.id}`} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
        <option value="">— keine —</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.label ?? o.id}</option>)}
      </select>
      <button type="button" onClick={() => void send('PUT', url, { label, floors: parseFloors(floors), tenantId: tenantId || null })}>Speichern</button>
      <button type="button" className="btn--danger" onClick={() => void send('DELETE', url)}>Löschen</button>
    </div>
  );
}

function AddSiteForm({ tenantId, onAdd }: { tenantId: string | null; onAdd: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [floors, setFloors] = useState('');
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border,#ddd)', paddingTop: 8, display: 'grid', gap: 6, maxWidth: 480 }}>
      <strong className="muted">Standort hinzufügen</strong>
      <input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="Standort-ID (z.B. ZR01), steht in den Regal-IDs, nicht änderbar" />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bezeichnung" />
      <input value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="Stockwerke, z.B. 0, 1" />
      <button type="button" disabled={!id || !label || !floors} onClick={() => void onAdd({ id: id.trim(), label: label.trim(), floors: parseFloors(floors), tenantId }).then((ok) => { if (ok) { setId(''); setLabel(''); setFloors(''); } })}>
        Hinzufügen
      </button>
    </div>
  );
}
