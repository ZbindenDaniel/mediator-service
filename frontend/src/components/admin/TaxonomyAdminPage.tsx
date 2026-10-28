import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoDownload, GoUpload } from 'react-icons/go';

// Master-detail editor for the DB-backed taxonomy (docs/PLANNING_TAXONOMY_EXTERNALIZATION.md Phase 4).
// Go-small-first: edit labelExternal + active + add rows on the surface; the rest behind "Erweitert".
// Reached from a nav link on /admin; uses the same adminSecret token.

interface Subcategory {
  code: number;
  labelExternal?: string;
  label?: string;
  labelInternal?: string;
  parentCode?: number;
  sortOrder?: number;
  active?: boolean;
  categorizerDescription?: string;
  intakeEnabled?: boolean;
  intakeLabel?: string;
  intakeSortOrder?: number;
  aliases?: string[];
}
interface Category {
  code: number;
  labelExternal?: string;
  label?: string;
  labelInternal?: string;
  sortOrder?: number;
  active?: boolean;
  subcategories: Subcategory[];
}

function authHeaders(): Record<string, string> {
  const token = (() => { try { return sessionStorage.getItem('adminSecret') ?? ''; } catch { return ''; } })();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const labelOf = (x: { labelExternal?: string; label?: string }) => x.labelExternal ?? x.label ?? '';

type ContractType = 'quality' | 'specs' | 'assembly';
interface Coverage { overlayEnabled: boolean; quality: Set<string>; specs: Set<string>; assembly: Set<string>; }

export default function TaxonomyAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCode, setSelectedCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [coverage, setCoverage] = useState<Coverage>({ overlayEnabled: false, quality: new Set(), specs: new Set(), assembly: new Set() });

  const loadCoverage = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/contracts', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const c = data.coverage ?? {};
      setCoverage({
        overlayEnabled: !!data.overlayEnabled,
        quality: new Set<string>(c.quality ?? []),
        specs: new Set<string>(c.specs ?? []),
        assembly: new Set<string>(c.assembly ?? [])
      });
    } catch { /* non-fatal — coverage badges just won't show */ }
  }, []);
  useEffect(() => { void loadCoverage(); }, [loadCoverage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/taxonomy', { headers: authHeaders() });
      if (res.status === 401) { setError('Nicht angemeldet. Bitte zuerst auf der Admin-Seite anmelden.'); return; }
      if (!res.ok) { setError(`Laden fehlgeschlagen (${res.status})`); return; }
      const data = await res.json();
      const cats: Category[] = Array.isArray(data.categories) ? data.categories : [];
      setCategories(cats);
      setError(null);
      setSelectedCode((prev) => (prev && cats.some((c) => c.code === prev) ? prev : cats[0]?.code ?? null));
    } catch (err) {
      setError('Netzwerkfehler beim Laden der Taxonomie.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => categories.find((c) => c.code === selectedCode) ?? null, [categories, selectedCode]);

  const send = useCallback(async (method: string, url: string, body: unknown): Promise<boolean> => {
    setMessage('');
    try {
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(`Fehler: ${data.error || res.status}`); return false; }
      await load();
      setMessage('Gespeichert.');
      return true;
    } catch {
      setMessage('Netzwerkfehler beim Speichern.');
      return false;
    }
  }, [load]);

  if (loading) return <div className="admin-page"><p className="muted">Lade Taxonomie…</p></div>;

  const needle = filter.trim().toLowerCase();
  const visibleCategories = needle
    ? categories.filter((c) => String(c.code).includes(needle)
      || labelOf(c).toLowerCase().includes(needle)
      || c.subcategories.some((sub) => String(sub.code).includes(needle) || labelOf(sub).toLowerCase().includes(needle)))
    : categories;
  const isError = message.startsWith('Fehler') || message.startsWith('Netzwerk');

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Taxonomie</h1>
        <Link className="admin-link admin-link--quiet" to="/admin">← Administration</Link>
      </div>
      <p className="admin-page__intro muted">
        Haupt- und Unterkategorien sowie ihre Contracts (Qualität, Spezifikation, Zerlegung).
        Codes sind fest; deaktivieren statt löschen.
      </p>
      {error && <div className="admin-flash admin-flash--error" role="alert">{error}</div>}
      {message && <div className={`admin-flash${isError ? ' admin-flash--error' : ''}`} aria-live="polite">{message}</div>}

      <div className="admin-split">
        <div className="card">
          <div className="admin-section-title">
            <h3>Hauptkategorien</h3>
            <span className="admin-list__meta">{categories.length}</span>
          </div>
          <input
            className="admin-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtern (Code oder Name)"
            aria-label="Kategorien filtern"
          />
          <ul className="admin-list">
            {visibleCategories.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className={`admin-list__item${c.code === selectedCode ? ' is-selected' : ''}${c.active === false ? ' is-inactive' : ''}`}
                  onClick={() => setSelectedCode(c.code)}
                  aria-current={c.code === selectedCode ? 'true' : undefined}
                >
                  <span className="admin-code">{c.code}</span>
                  <span className="admin-list__label" title={labelOf(c)}>{labelOf(c)}</span>
                  <span className="admin-list__meta">{c.subcategories.length}</span>
                </button>
              </li>
            ))}
            {visibleCategories.length === 0 && <li className="admin-empty">Keine Treffer.</li>}
          </ul>
          <AddCategoryForm onAdd={(body) => send('POST', '/api/admin/taxonomy/categories', body)} />
        </div>

        <div className="card">
          {selected ? (
            <>
              <div className="admin-section-title">
                <h3><span className="admin-code">{selected.code}</span> {labelOf(selected)}</h3>
                {selected.active === false && <span className="admin-pill admin-pill--muted">inaktiv</span>}
              </div>
              <CategoryEditor
                key={selected.code}
                category={selected}
                onSave={(patch) => send('PUT', `/api/admin/taxonomy/categories/${selected.code}`, patch)}
              />
              <div className="admin-section-title">
                <h4>Unterkategorien</h4>
                <span className="admin-list__meta">{selected.subcategories.length}</span>
              </div>
              {selected.subcategories.length === 0 && <p className="admin-empty">Noch keine Unterkategorien.</p>}
              {selected.subcategories.map((sub) => (
                <SubcategoryEditor
                  key={sub.code}
                  sub={sub}
                  onSave={(patch) => send('PUT', `/api/admin/taxonomy/subcategories/${sub.code}`, patch)}
                  coverage={coverage}
                  onContractsChanged={loadCoverage}
                />
              ))}
              <AddSubcategoryForm
                parentCode={selected.code}
                onAdd={(body) => send('POST', '/api/admin/taxonomy/subcategories', body)}
              />
            </>
          ) : (
            <p className="admin-empty">Keine Kategorie ausgewählt.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({ category, onSave }: { category: Category; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const [labelExternal, setLabelExternal] = useState(labelOf(category));
  const [active, setActive] = useState(category.active !== false);
  useEffect(() => {
    setLabelExternal(labelOf(category));
    setActive(category.active !== false);
  }, [category]);
  const dirty = labelExternal !== labelOf(category) || active !== (category.active !== false);
  return (
    <div className="admin-form">
      <label className="admin-field">
        <span>Anzeigename</span>
        <input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} />
      </label>
      <div className="admin-actions">
        <label className="admin-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> aktiv</label>
        <button type="button" className="admin-btn" disabled={!dirty} onClick={() => onSave({ labelExternal, active })}>Speichern</button>
      </div>
    </div>
  );
}

function SubcategoryEditor({ sub, onSave, coverage, onContractsChanged }: {
  sub: Subcategory;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  coverage: Coverage;
  onContractsChanged: () => void;
}) {
  const initial = {
    labelExternal: labelOf(sub),
    active: sub.active !== false,
    labelInternal: sub.labelInternal ?? '',
    sortOrder: String(sub.sortOrder ?? ''),
    categorizerDescription: sub.categorizerDescription ?? '',
    intakeEnabled: !!sub.intakeEnabled,
    intakeLabel: sub.intakeLabel ?? '',
    aliases: (sub.aliases ?? []).join(', ')
  };
  const [form, setForm] = useState(initial);
  // Re-sync after a save: the server may normalise values (e.g. derive the internal key), and the
  // row must reflect that instead of comparing stale input against new data.
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setForm(initial); }, [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) => setForm((f) => ({ ...f, [key]: value }));
  // Compare against the server state so Save only lights up when something actually changed.
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k]);

  const save = () => onSave({
    labelExternal: form.labelExternal,
    active: form.active,
    labelInternal: form.labelInternal.trim() || undefined,
    sortOrder: form.sortOrder.trim() === '' ? undefined : Number(form.sortOrder),
    categorizerDescription: form.categorizerDescription.trim() ? form.categorizerDescription.trim() : null,
    intakeEnabled: form.intakeEnabled,
    intakeLabel: form.intakeLabel.trim() ? form.intakeLabel.trim() : null,
    aliases: form.aliases.trim() ? form.aliases.split(',').map((a) => a.trim()).filter(Boolean) : null
  });

  return (
    <div className={`admin-row${form.active ? '' : ' is-inactive'}`}>
      <div className="admin-row__main">
        <span className="admin-code">{sub.code}</span>
        <input value={form.labelExternal} onChange={(e) => set('labelExternal', e.target.value)} aria-label={`Anzeigename ${sub.code}`} />
        <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> aktiv</label>
        <button type="button" className="admin-btn" disabled={!dirty} onClick={save}>Speichern</button>
      </div>
      <ContractControls code={sub.code} coverage={coverage} onChanged={onContractsChanged} />
      <details className="admin-row__more">
        <summary>Erweitert</summary>
        <div className="admin-form">
          <label className="admin-field">
            <span>Interner Schlüssel (Schnittstelle)</span>
            <input value={form.labelInternal} onChange={(e) => set('labelInternal', e.target.value)} placeholder="automatisch" />
          </label>
          <label className="admin-field">
            <span>Sortierung</span>
            <input value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} inputMode="numeric" />
          </label>
          <label className="admin-field admin-field--wide">
            <span>Aliasse (kommagetrennt)</span>
            <input value={form.aliases} onChange={(e) => set('aliases', e.target.value)} />
          </label>
          <label className="admin-field admin-field--wide">
            <span>Kategorisierer-Hinweis (kurz halten)</span>
            <textarea value={form.categorizerDescription} onChange={(e) => set('categorizerDescription', e.target.value)} rows={2} />
          </label>
          <label className="admin-check"><input type="checkbox" checked={form.intakeEnabled} onChange={(e) => set('intakeEnabled', e.target.checked)} /> im Intake-Menü</label>
          {form.intakeEnabled && (
            <label className="admin-field">
              <span>Intake-Label</span>
              <input value={form.intakeLabel} onChange={(e) => set('intakeLabel', e.target.value)} />
            </label>
          )}
        </div>
      </details>
    </div>
  );
}

const CONTRACT_TYPES: { type: ContractType; label: string }[] = [
  { type: 'quality', label: 'Qualität' },
  { type: 'specs', label: 'Spezifikation' },
  { type: 'assembly', label: 'Zerlegung' }
];

function ContractControls({ code, coverage, onChanged }: { code: number; coverage: Coverage; onChanged: () => void }) {
  const [busy, setBusy] = useState<ContractType | null>(null);
  const [msg, setMsg] = useState('');

  const download = async (type: ContractType) => {
    try {
      const res = await fetch(`/api/contracts/${type}/${code}`);
      if (!res.ok) { setMsg(`${type}: kein Contract (${res.status})`); return; }
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${type}-${code}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { setMsg(`${type}: Download fehlgeschlagen`); }
  };

  const upload = async (type: ContractType, file: File) => {
    setBusy(type); setMsg('');
    try {
      const text = await file.text();
      try { JSON.parse(text); } catch { setMsg(`${type}: Datei ist kein gültiges JSON`); return; }
      const res = await fetch(`/api/admin/contracts/${type}/${code}`, { method: 'PUT', headers: authHeaders(), body: text });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(`${type}: ${data.error || res.status}`); return; }
      setMsg(`${type}: hochgeladen`);
      onChanged();
    } catch { setMsg(`${type}: Upload fehlgeschlagen`); }
    finally { setBusy(null); }
  };

  return (
    <div className="admin-contracts">
      {CONTRACT_TYPES.map(({ type, label }) => {
        const present = coverage[type].has(String(code));
        return (
          <span
            key={type}
            className={`admin-contract ${present ? 'is-present' : 'is-missing'}`}
            title={present ? `${label}: eigener Contract vorhanden` : `${label}: kein eigener Contract (fällt auf den allgemeinen zurück)`}
          >
            {present ? '✓' : '–'} {label}
            {present && (
              <button type="button" className="admin-icon-btn" onClick={() => download(type)} aria-label={`${label} herunterladen`} title="Herunterladen">
                <GoDownload aria-hidden="true" />
              </button>
            )}
            {coverage.overlayEnabled && (
              <label className="admin-icon-btn" title={present ? 'Ersetzen (hochladen)' : 'Hochladen'} aria-label={`${label} hochladen`}>
                {busy === type ? '…' : <GoUpload aria-hidden="true" />}
                <input
                  type="file" accept="application/json,.json" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(type, f); e.currentTarget.value = ''; }}
                />
              </label>
            )}
          </span>
        );
      })}
      {!coverage.overlayEnabled && <span className="muted" title="CONTRACTS_OVERLAY_DIR nicht gesetzt">Upload deaktiviert</span>}
      {msg && <span className="muted" aria-live="polite">{msg}</span>}
    </div>
  );
}

function AddCategoryForm({ onAdd }: { onAdd: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [labelExternal, setLabelExternal] = useState('');
  const submit = async () => {
    if (!code.trim() || !labelExternal.trim()) return;
    const ok = await onAdd({ code: Number(code), labelExternal: labelExternal.trim() });
    if (ok) { setCode(''); setLabelExternal(''); }
  };
  return (
    <details className="admin-add">
      <summary>＋ Kategorie hinzufügen</summary>
      <div className="admin-form">
        <label className="admin-field"><span>Code</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="z.B. 210" inputMode="numeric" /></label>
        <label className="admin-field"><span>Anzeigename</span><input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} /></label>
        <div className="admin-actions"><button type="button" className="admin-btn" disabled={!code.trim() || !labelExternal.trim()} onClick={submit}>Hinzufügen</button></div>
      </div>
    </details>
  );
}

function AddSubcategoryForm({ parentCode, onAdd }: { parentCode: number; onAdd: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [labelExternal, setLabelExternal] = useState('');
  const submit = async () => {
    if (!code.trim() || !labelExternal.trim()) return;
    const ok = await onAdd({ code: Number(code), parentCode, labelExternal: labelExternal.trim() });
    if (ok) { setCode(''); setLabelExternal(''); }
  };
  return (
    <details className="admin-add">
      <summary>＋ Unterkategorie hinzufügen (unter {parentCode})</summary>
      <div className="admin-form">
        <label className="admin-field"><span>Code</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder={`z.B. ${parentCode}01`} inputMode="numeric" /></label>
        <label className="admin-field"><span>Anzeigename</span><input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} /></label>
        <div className="admin-actions"><button type="button" className="admin-btn" disabled={!code.trim() || !labelExternal.trim()} onClick={submit}>Hinzufügen</button></div>
      </div>
    </details>
  );
}
