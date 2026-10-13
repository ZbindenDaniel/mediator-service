import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { setShelfLocations } from '../../data/shelfLocations';
import { dialogService } from '../dialog';
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
        const snap: Snapshot = await res.json();
        apply(snap);
        // Open the first org right away instead of an empty detail panel.
        setSelectedId((prev) => prev ?? snap.tenants[0]?.id ?? null);
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

  const isError = Boolean(error);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Organisationen</h1>
        <Link className="admin-link admin-link--quiet" to="/admin">← Administration</Link>
      </div>
      <p className="admin-page__intro muted">
        Benutzer und Gruppen verwaltest du in Authentik. Hier legst du eine Organisation an und
        verknüpfst sie über den <strong>Gruppennamen</strong>. Plattform-Admins sind in der Gruppe
        „{data?.platformAdminGroup ?? '…'}“.
      </p>
      {isError && <div className="admin-flash admin-flash--error" role="alert">{error}</div>}
      {!isError && message && <div className="admin-flash" aria-live="polite">{message}</div>}

      <div className="admin-split">
        <div className="card">
          <div className="admin-section-title">
            <h3>Organisationen</h3>
            <span className="admin-list__meta">{orgs.length}</span>
          </div>
          <ul className="admin-list">
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`admin-list__item${o.id === selectedId ? ' is-selected' : ''}${o.active ? '' : ' is-inactive'}`}
                  onClick={() => setSelectedId(o.id)}
                  aria-current={o.id === selectedId ? 'true' : undefined}
                >
                  <span className="admin-list__label" title={o.label ?? o.id}>{o.label ?? o.id}</span>
                  {!o.authentikGroup && <span className="admin-pill" title="Ohne Gruppe kann sich niemand dieser Organisation zuordnen">keine Gruppe</span>}
                  <span className="admin-list__meta">{o.sites.length} Standort{o.sites.length === 1 ? '' : 'e'}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={`admin-list__item${showUnassigned ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(UNASSIGNED)}
                aria-current={showUnassigned ? 'true' : undefined}
              >
                <span className="admin-list__label"><em>Standorte ohne Organisation</em></span>
                <span className="admin-list__meta">{data?.unassignedSites.length ?? 0}</span>
              </button>
            </li>
          </ul>
          <AddOrgForm onAdd={async (body) => {
            if (await send('POST', '/api/admin/tenants', body)) setSelectedId(body.id);
          }} />
        </div>

        <div className="card">
          {selected ? (
            <>
              <div className="admin-section-title">
                <h3>{selected.label ?? selected.id} <span className="admin-code">{selected.id}</span></h3>
                {!selected.active && <span className="admin-pill admin-pill--muted">inaktiv</span>}
              </div>
              <OrgEditor key={selected.id} org={selected} onSave={(patch) => send('PUT', `/api/admin/tenants/${encodeURIComponent(selected.id)}`, patch)} />
              <div className="admin-section-title">
                <h4>Standorte</h4>
                <span className="admin-list__meta">Regal-IDs: S-‹Standort›-‹Stockwerk›-‹Nr›</span>
              </div>
              <SiteList sites={selected.sites} orgs={orgs} send={send} />
              <AddSiteForm tenantId={selected.id} onAdd={(body) => send('POST', '/api/admin/sites', body)} />
            </>
          ) : showUnassigned ? (
            <>
              <div className="admin-section-title"><h3>Standorte ohne Organisation</h3></div>
              <p className="admin-page__intro muted">Für alle nutzbar. Einer Organisation zuweisen, sobald sie eigene Standorte hat.</p>
              <SiteList sites={data?.unassignedSites ?? []} orgs={orgs} send={send} />
              <AddSiteForm tenantId={null} onAdd={(body) => send('POST', '/api/admin/sites', body)} />
            </>
          ) : (
            <p className="admin-empty">Organisation auswählen oder unten links neu anlegen.</p>
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
    <details className="admin-add">
      <summary>＋ Organisation anlegen</summary>
      <div className="admin-form">
        <label className="admin-field admin-field--wide">
          <span>ID (Kleinbuchstaben, nicht änderbar)</span>
          <input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="z.B. zurichrepair" />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Zurich Repair" />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Authentik-Gruppe</span>
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="z.B. tenant-zurichrepair" />
        </label>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn"
            disabled={!id || !label}
            onClick={() => void onAdd({ id: id.trim(), label: label.trim(), authentikGroup: group.trim() }).then(() => { setId(''); setLabel(''); setGroup(''); })}
          >
            Anlegen
          </button>
        </div>
      </div>
    </details>
  );
}

function OrgEditor({ org, onSave }: { org: Org; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const initial = {
    label: org.label ?? '',
    contactEmail: org.contactEmail ?? '',
    authentikGroup: org.authentikGroup ?? '',
    authentikSuperGroup: org.authentikSuperGroup ?? '',
    active: org.active
  };
  const [form, setForm] = useState(initial);
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setForm(initial); }, [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k]);
  return (
    <div className="admin-form">
      <label className="admin-field"><span>Name</span><input value={form.label} onChange={(e) => set('label', e.target.value)} /></label>
      <label className="admin-field"><span>Kontakt-E-Mail (für Bestellungen)</span><input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></label>
      <label className="admin-field"><span>Authentik-Gruppe (Benutzer)</span><input value={form.authentikGroup} onChange={(e) => set('authentikGroup', e.target.value)} placeholder="tenant-…" /></label>
      <label className="admin-field"><span>Authentik-Gruppe (Org-Admins, optional)</span><input value={form.authentikSuperGroup} onChange={(e) => set('authentikSuperGroup', e.target.value)} placeholder="tenant-…-admin" /></label>
      <div className="admin-actions admin-field--wide">
        <label className="admin-check" title="Inaktiv: Logins dieser Gruppe gehören zu keiner Organisation">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> aktiv
        </label>
        <button type="button" className="admin-btn" disabled={!dirty} onClick={() => void onSave(form)}>Speichern</button>
      </div>
    </div>
  );
}

function SiteList({ sites, orgs, send }: {
  sites: Site[];
  orgs: Org[];
  send: (method: string, url: string, body?: unknown) => Promise<boolean>;
}) {
  if (sites.length === 0) return <p className="admin-empty">Noch keine Standorte.</p>;
  return (
    <div className="admin-table" role="table" aria-label="Standorte">
      <div className="admin-table__row admin-table__head" role="row">
        <span role="columnheader">ID</span>
        <span role="columnheader">Bezeichnung</span>
        <span role="columnheader">Stockwerke</span>
        <span role="columnheader">Organisation</span>
        <span role="columnheader" className="visually-hidden">Aktionen</span>
      </div>
      {sites.map((s) => <SiteEditor key={s.id} site={s} orgs={orgs} send={send} />)}
    </div>
  );
}

function SiteEditor({ site, orgs, send }: {
  site: Site;
  orgs: Org[];
  send: (method: string, url: string, body?: unknown) => Promise<boolean>;
}) {
  const initial = { label: site.label, floors: site.floors.join(', '), tenantId: site.tenantId ?? '' };
  const [form, setForm] = useState(initial);
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setForm(initial); }, [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = form.label !== initial.label || form.floors !== initial.floors || form.tenantId !== initial.tenantId;
  const url = `/api/admin/sites/${encodeURIComponent(site.id)}`;
  const remove = async () => {
    const ok = await dialogService.confirm({
      title: 'Standort löschen',
      message: `Standort ${site.id} („${site.label}“) wirklich löschen? Nur möglich, solange er keine Regale hat.`,
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (ok) await send('DELETE', url);
  };
  return (
    <div className="admin-table__row" role="row">
      <span className="admin-code" role="cell">{site.id}</span>
      <input role="cell" aria-label={`Bezeichnung ${site.id}`} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <input role="cell" aria-label={`Stockwerke ${site.id}`} value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} placeholder="0, 1" />
      <select role="cell" aria-label={`Organisation ${site.id}`} value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
        <option value="">— keine —</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.label ?? o.id}</option>)}
      </select>
      <span className="admin-actions" role="cell">
        <button type="button" className="admin-btn" disabled={!dirty} onClick={() => void send('PUT', url, { label: form.label, floors: parseFloors(form.floors), tenantId: form.tenantId || null })}>Speichern</button>
        <button type="button" className="admin-btn admin-btn--icon admin-btn--danger" onClick={() => void remove()} aria-label={`Standort ${site.id} löschen`} title="Löschen">✕</button>
      </span>
    </div>
  );
}

function AddSiteForm({ tenantId, onAdd }: { tenantId: string | null; onAdd: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [floors, setFloors] = useState('');
  const ready = Boolean(id.trim() && label.trim() && floors.trim());
  return (
    <details className="admin-add">
      <summary>＋ Standort hinzufügen</summary>
      <div className="admin-form">
        <label className="admin-field">
          <span>Standort-ID (steht in den Regal-IDs, nicht änderbar)</span>
          <input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="z.B. ZR01" />
        </label>
        <label className="admin-field"><span>Bezeichnung</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Lager Altstetten" /></label>
        <label className="admin-field"><span>Stockwerke (kommagetrennt)</span><input value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="0, 1" /></label>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn"
            disabled={!ready}
            onClick={() => void onAdd({ id: id.trim(), label: label.trim(), floors: parseFloors(floors), tenantId }).then((ok) => { if (ok) { setId(''); setLabel(''); setFloors(''); } })}
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </details>
  );
}
