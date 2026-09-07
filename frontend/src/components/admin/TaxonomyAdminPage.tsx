import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

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

  return (
    <div className="admin-page">
      <div className="admin-page__header" style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <h1 className="admin-page__title">Taxonomie</h1>
        <Link to="/admin">← Administration</Link>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <p className="muted" aria-live="polite">{message}</p>}

      <div className="row" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Master: category list */}
        <div className="card" style={{ flex: '0 0 320px' }}>
          <h3>Hauptkategorien</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {categories.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => setSelectedCode(c.code)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none',
                    background: c.code === selectedCode ? 'var(--surface-selected, #eef)' : 'transparent',
                    opacity: c.active === false ? 0.5 : 1, cursor: 'pointer'
                  }}
                >
                  <strong>{c.code}</strong> {labelOf(c)}{c.active === false ? ' (inaktiv)' : ''}
                  <span className="muted"> · {c.subcategories.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <AddCategoryForm onAdd={(body) => send('POST', '/api/admin/taxonomy/categories', body)} />
        </div>

        {/* Detail: subcategories of the selected category */}
        <div className="card" style={{ flex: 1 }}>
          {selected ? (
            <>
              <h3>{selected.code} · {labelOf(selected)}</h3>
              <CategoryEditor
                key={selected.code}
                category={selected}
                onSave={(patch) => send('PUT', `/api/admin/taxonomy/categories/${selected.code}`, patch)}
              />
              <h4>Unterkategorien</h4>
              {selected.subcategories.map((s) => (
                <SubcategoryEditor
                  key={s.code}
                  sub={s}
                  onSave={(patch) => send('PUT', `/api/admin/taxonomy/subcategories/${s.code}`, patch)}
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
            <p className="muted">Keine Kategorie ausgewählt.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({ category, onSave }: { category: Category; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const [labelExternal, setLabelExternal] = useState(labelOf(category));
  const [active, setActive] = useState(category.active !== false);
  return (
    <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} aria-label="Anzeigename" />
      <label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> aktiv</label>
      <button type="button" onClick={() => onSave({ labelExternal, active })}>Speichern</button>
    </div>
  );
}

function SubcategoryEditor({ sub, onSave, coverage, onContractsChanged }: {
  sub: Subcategory;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  coverage: Coverage;
  onContractsChanged: () => void;
}) {
  const [labelExternal, setLabelExternal] = useState(labelOf(sub));
  const [active, setActive] = useState(sub.active !== false);
  const [labelInternal, setLabelInternal] = useState(sub.labelInternal ?? '');
  const [sortOrder, setSortOrder] = useState(String(sub.sortOrder ?? ''));
  const [categorizerDescription, setCategorizerDescription] = useState(sub.categorizerDescription ?? '');
  const [intakeEnabled, setIntakeEnabled] = useState(!!sub.intakeEnabled);
  const [intakeLabel, setIntakeLabel] = useState(sub.intakeLabel ?? '');
  const [aliases, setAliases] = useState((sub.aliases ?? []).join(', '));

  const save = () => onSave({
    labelExternal, active,
    labelInternal: labelInternal.trim() || undefined,
    sortOrder: sortOrder.trim() === '' ? undefined : Number(sortOrder),
    categorizerDescription: categorizerDescription.trim() ? categorizerDescription.trim() : null,
    intakeEnabled,
    intakeLabel: intakeLabel.trim() ? intakeLabel.trim() : null,
    aliases: aliases.trim() ? aliases.split(',').map((a) => a.trim()).filter(Boolean) : null
  });

  return (
    <div style={{ borderTop: '1px solid var(--border, #ddd)', padding: '6px 0', opacity: active ? 1 : 0.5 }}>
      <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ minWidth: 48 }}>{sub.code}</strong>
        <input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} aria-label="Anzeigename" />
        <label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> aktiv</label>
        <button type="button" onClick={save}>Speichern</button>
      </div>
      <details style={{ marginTop: 4 }}>
        <summary className="muted">Erweitert</summary>
        <div style={{ display: 'grid', gap: 6, padding: '6px 0' }}>
          <label>Interner Schlüssel (Schnittstelle)
            <input value={labelInternal} onChange={(e) => setLabelInternal(e.target.value)} placeholder="auto" />
          </label>
          <label>Sortierung <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" /></label>
          <label>Kategorisierer-Hinweis (kurz halten)
            <textarea value={categorizerDescription} onChange={(e) => setCategorizerDescription(e.target.value)} rows={2} />
          </label>
          <label><input type="checkbox" checked={intakeEnabled} onChange={(e) => setIntakeEnabled(e.target.checked)} /> im Intake-Menü</label>
          {intakeEnabled && (
            <label>Intake-Label <input value={intakeLabel} onChange={(e) => setIntakeLabel(e.target.value)} /></label>
          )}
          <label>Aliasse (kommagetrennt) <input value={aliases} onChange={(e) => setAliases(e.target.value)} /></label>
        </div>
      </details>
      <ContractControls code={sub.code} coverage={coverage} onChanged={onContractsChanged} />
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
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, fontSize: '0.85em' }}>
      <span className="muted">Contracts:</span>
      {CONTRACT_TYPES.map(({ type, label }) => {
        const present = coverage[type].has(String(code));
        return (
          <span key={type} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <span title={present ? 'vorhanden' : 'fällt auf general/keinen zurück'}>{present ? '✓' : '—'} {label}</span>
            <button type="button" onClick={() => download(type)} disabled={!present} title="Herunterladen">⬇</button>
            {coverage.overlayEnabled ? (
              <label title="Hochladen" style={{ cursor: 'pointer' }}>
                {busy === type ? '…' : '⬆'}
                <input
                  type="file" accept="application/json,.json" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(type, f); e.currentTarget.value = ''; }}
                />
              </label>
            ) : null}
          </span>
        );
      })}
      {!coverage.overlayEnabled && <span className="muted" title="CONTRACTS_OVERLAY_DIR nicht gesetzt">(Upload deaktiviert)</span>}
      {msg && <span className="muted">{msg}</span>}
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
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border,#ddd)', paddingTop: 8, display: 'grid', gap: 6 }}>
      <strong className="muted">Kategorie hinzufügen</strong>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (z.B. 210)" inputMode="numeric" />
      <input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} placeholder="Anzeigename" />
      <button type="button" onClick={submit}>Hinzufügen</button>
    </div>
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
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border,#ddd)', paddingTop: 8, display: 'grid', gap: 6 }}>
      <strong className="muted">Unterkategorie hinzufügen (unter {parentCode})</strong>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (z.B. 2101)" inputMode="numeric" />
      <input value={labelExternal} onChange={(e) => setLabelExternal(e.target.value)} placeholder="Anzeigename" />
      <button type="button" onClick={submit}>Hinzufügen</button>
    </div>
  );
}
