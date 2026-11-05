// Offline UI preview harness — renders the recent agentic review surfaces against fixtures, with NO
// backend, DB, model or specific item state. Build with `npm run preview:ui`, then open the printed
// HTML file in any browser. Lets us eyeball L10 (data-quality badge), L5a (findings + "Beheben") and
// L5b (review wizard: stepper + verified-collapse) without reproducing a real item.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataQualityBadge } from '../src/components/DataQualityBadge';
import { FindingsPanel } from '../src/components/FindingsPanel';
import { AgenticReviewWizard, type AgenticReviewWizardData } from '../src/components/AgenticReviewWizard';
import type { Finding } from '../../models/agentic-findings';
import type { DataQualityGrade } from '../../models/data-quality';

// --- Fixtures (plain objects; the real formula lives server-side, these just exercise the views) ---
const GRADE_CLEAN: DataQualityGrade = { score: 0.95, grade: 5, label: 'Vollständig', capped: false, components: { conformance: 1, completeness: 1, freshness: 0.75 } };
const GRADE_STALE: DataQualityGrade = { score: 0.72, grade: 4, label: 'Gut', capped: false, components: { conformance: 1, completeness: 0.8, freshness: 0.5 } };
const GRADE_CAPPED: DataQualityGrade = { score: 0.4, grade: 3, label: 'Ausreichend', capped: true, components: { conformance: 0.5, completeness: 0.6, freshness: 1 } };

const FINDINGS: Finding[] = [
  { type: 'missing_required', severity: 'block', field: 'Prozessor', message: 'Pflichtfeld „Prozessor“ fehlt.', ask: 'fix' },
  { type: 'banned_phrase', severity: 'warn', field: 'Artikelbeschreibung', message: 'Garantie-Formulierung entfernen.', evidence: 'mit einer Garantie von', ask: 'fix', ruleId: 'warranty-clause' },
  { type: 'intake_conflict', severity: 'warn', field: 'RAM', message: 'Erfassung weicht ab (8 GB gemessen).', evidence: '8 GB', ask: 'choose' },
];

const WIZARD_DATA: AgenticReviewWizardData = {
  artikelbeschreibung: 'Lenovo ThinkPad X270 mit einer Garantie von 24 Monaten',
  kurzbeschreibung: 'Business-Notebook',
  laenge: '', breite: '', hoehe: '', gewicht: '', price: '',
  specFields: [
    { key: 'Prozessor', value: '', required: true, description: 'CPU-Modell' },          // empty + required → noteworthy
    { key: 'Anschlüsse', value: 'DP', required: false },                                  // filled, unflagged → collapses
    { key: 'Farbe', value: 'Schwarz', required: false },                                  // filled, unflagged → collapses
    { key: 'RAM', value: '16 GB', required: false, intakeValue: '8 GB' },                 // intake conflict → noteworthy
  ],
  findings: FINDINGS,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: '0 0 28px', padding: '16px', border: '1px solid var(--border,#d0d5dd)', borderRadius: '10px' }}>
      <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function App() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState<'none' | 'findings' | 'clean'>('none');
  const note = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l].slice(0, 12));

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: '1.3rem' }}>Agentic review — UI preview</h1>
      <p className="muted">Offline fixtures. No backend, DB, model or real item needed. This is what the KI tab / review wizard render once a run has a data-quality grade and findings.</p>

      <Section title="L10 · Datenqualität-Badge (verschiedene Zustände)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <DataQualityBadge quality={GRADE_CLEAN} />
          <DataQualityBadge quality={GRADE_STALE} />
          <DataQualityBadge quality={GRADE_CAPPED} />
          <div><span className="muted" style={{ fontSize: '0.85em' }}>(ohne Spec-Contract → kein Badge:)</span> <DataQualityBadge quality={null} /></div>
        </div>
      </Section>

      <Section title="L5a · KI-Tab: Badge + Befunde mit „Beheben“">
        <label style={{ display: 'inline-flex', gap: 6, fontSize: '0.85em', marginBottom: 8 }}>
          <input type="checkbox" checked={busy} onChange={(e) => setBusy(e.target.checked)} /> busy (Rework läuft — Buttons deaktiviert)
        </label>
        <DataQualityBadge quality={GRADE_CAPPED} />
        <FindingsPanel
          findings={FINDINGS}
          busy={busy}
          onFix={(f) => note(`Beheben → gezielter Rework von „${f.field}“ (${f.type})`)}
        />
        <p className="muted" style={{ fontSize: '0.8em' }}>„Beheben“ erscheint nur bei ask=fix (Prozessor, Artikelbeschreibung) — nicht beim Konflikt (RAM, ask=choose).</p>
      </Section>

      <Section title="L5b · Review-Wizard (Stepper + Verified-Collapse)">
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setWizard('findings')}>Wizard mit Befunden öffnen</button>
          <button type="button" className="btn secondary" onClick={() => setWizard('clean')}>Wizard ohne Befunde öffnen</button>
        </div>
        <p className="muted" style={{ fontSize: '0.8em' }}>Mit Befunden: Schritt-Chips markieren „zu prüfen“; im Schritt Spezifikationen sind „Anschlüsse/Farbe“ als geprüft eingeklappt, „Prozessor“ (leer) + „RAM“ (Konflikt) sichtbar.</p>
      </Section>

      <Section title="Aktionen-Log">
        {log.length === 0 ? <p className="muted" style={{ fontSize: '0.85em' }}>Noch nichts — klick „Beheben“ oder schliess den Wizard ab.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85em' }}>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        )}
      </Section>

      {wizard !== 'none' ? (
        <AgenticReviewWizard
          data={wizard === 'findings' ? WIZARD_DATA : { ...WIZARD_DATA, findings: [] }}
          onResolve={(r) => { setWizard('none'); note(r ? `Wizard: ${r.decision}` : 'Wizard: abgebrochen'); }}
        />
      ) : null}
    </div>
  );
}

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
