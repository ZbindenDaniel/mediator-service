import React, { useMemo, useState } from 'react';
import { logError } from '../utils/logger';

// A single spec/contract field the reviewer can edit (blank value = remove the field).
export interface ReviewWizardSpecField {
  key: string;
  value: string;
  required?: boolean;
  description?: string;
  intakeValue?: string | null;
  removable?: boolean;
}

// Initial values handed to the wizard — the current item state the reviewer edits in place.
export interface AgenticReviewWizardData {
  artikelbeschreibung: string;
  kurzbeschreibung: string;
  laenge: string;
  breite: string;
  hoehe: string;
  gewicht: string;
  price: string;
  specFields: ReviewWizardSpecField[];
}

export interface AgenticReviewWizardResult {
  decision: 'approved' | 'rejected';
  referenceEdits: Record<string, string>;
  specValues: Record<string, string>;
  reviewPrice: number | null;
  shopArticle: boolean | null;
  notes: string;
}

interface Props {
  data: AgenticReviewWizardData;
  onResolve: (result: AgenticReviewWizardResult | null) => void;
}

// Ordered content steps; a summary + optional shop step follow.
const CONTENT_STEPS = [
  { id: 'beschreibung', label: 'Artikelbeschreibung' },
  { id: 'kurztext', label: 'Kurztext' },
  { id: 'spezifikationen', label: 'Spezifikationen' },
  { id: 'dimensionen', label: 'Dimensionen' },
  { id: 'preis', label: 'Preis' }
] as const;

type ContentStepId = (typeof CONTENT_STEPS)[number]['id'];
type View = { kind: 'content'; index: number } | { kind: 'summary' } | { kind: 'shop' };

export function AgenticReviewWizard({ data, onResolve }: Props) {
  const [artikelbeschreibung, setArtikelbeschreibung] = useState(data.artikelbeschreibung);
  const [kurzbeschreibung, setKurzbeschreibung] = useState(data.kurzbeschreibung);
  const [laenge, setLaenge] = useState(data.laenge);
  const [breite, setBreite] = useState(data.breite);
  const [hoehe, setHoehe] = useState(data.hoehe);
  const [gewicht, setGewicht] = useState(data.gewicht);
  const [price, setPrice] = useState(data.price);
  const initialSpecValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of data.specFields) values[field.key] = field.value ?? '';
    return values;
  }, [data.specFields]);
  const [specValues, setSpecValues] = useState<Record<string, string>>(initialSpecValues);
  const [shopArticle, setShopArticle] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>({ kind: 'content', index: 0 });

  const setNote = (stepId: string, value: string) => setNotes((prev) => ({ ...prev, [stepId]: value }));
  const updateSpec = (key: string, value: string) => setSpecValues((prev) => ({ ...prev, [key]: value }));

  const stepNoteInput = (stepId: string) => (
    <div className="review-dialog__step-note">
      <label className="contract-field-row__label" htmlFor={`wizard-note-${stepId}`}>
        <span className="contract-field-row__key">Feedback</span>
      </label>
      <textarea
        id={`wizard-note-${stepId}`}
        className="review-dialog__step-note-input"
        rows={2}
        value={notes[stepId] ?? ''}
        placeholder="Feedback zu diesem Schritt (optional)"
        onChange={(e) => setNote(stepId, e.target.value)}
      />
    </div>
  );

  const buildResult = (decision: 'approved' | 'rejected'): AgenticReviewWizardResult => {
    const referenceEdits: Record<string, string> = {};
    const setTextEdit = (key: string, current: string, original: string) => {
      const trimmed = current.trim();
      if (trimmed && trimmed !== original.trim()) referenceEdits[key] = trimmed;
    };
    const setNumericEdit = (key: string, current: string, original: string) => {
      const normalized = current.replace(',', '.').trim();
      if (!normalized || normalized === original.replace(',', '.').trim()) return;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed >= 0) referenceEdits[key] = String(parsed);
    };
    setTextEdit('Artikelbeschreibung', artikelbeschreibung, data.artikelbeschreibung);
    setTextEdit('Kurzbeschreibung', kurzbeschreibung, data.kurzbeschreibung);
    setNumericEdit('Länge_mm', laenge, data.laenge);
    setNumericEdit('Breite_mm', breite, data.breite);
    setNumericEdit('Höhe_mm', hoehe, data.hoehe);
    setNumericEdit('Gewicht_kg', gewicht, data.gewicht);

    let reviewPrice: number | null = null;
    const priceRaw = price.replace(',', '.').trim();
    if (priceRaw) {
      const parsed = Number(priceRaw);
      if (Number.isFinite(parsed) && parsed >= 0) reviewPrice = parsed;
    }

    const noteFragments: string[] = [];
    for (const step of CONTENT_STEPS) {
      const note = (notes[step.id] ?? '').trim();
      if (note) noteFragments.push(`${step.label}: ${note}`);
    }
    const shopNote = (notes.shop ?? '').trim();
    if (shopNote) noteFragments.push(`Shop: ${shopNote}`);
    const summaryNote = (notes.zusammenfassung ?? '').trim();
    if (summaryNote) noteFragments.push(`Entscheid: ${summaryNote}`);

    return {
      decision,
      referenceEdits,
      specValues: { ...specValues },
      reviewPrice,
      shopArticle: decision === 'approved' ? shopArticle : null,
      notes: noteFragments.join('\n')
    };
  };

  const resolveWith = (decision: 'approved' | 'rejected') => {
    try {
      onResolve(buildResult(decision));
    } catch (error) {
      logError('AgenticReviewWizard: Failed to submit review', error, { decision });
    }
  };

  const goBack = () => {
    setView((current) => {
      if (current.kind === 'shop') return { kind: 'summary' };
      if (current.kind === 'summary') return { kind: 'content', index: CONTENT_STEPS.length - 1 };
      if (current.index === 0) return current;
      return { kind: 'content', index: current.index - 1 };
    });
  };

  const goNext = () => {
    setView((current) => {
      if (current.kind !== 'content') return current;
      if (current.index >= CONTENT_STEPS.length - 1) return { kind: 'summary' };
      return { kind: 'content', index: current.index + 1 };
    });
  };

  const cancel = () => onResolve(null);

  const numberField = (id: string, label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <div className="contract-field-row">
      <label className="contract-field-row__label" htmlFor={`wizard-${id}`}>
        <span className="contract-field-row__key">{label}</span>
      </label>
      <div className="contract-field-row__input-row">
        <input
          id={`wizard-${id}`}
          type="number"
          inputMode="decimal"
          className="contract-field-row__input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );

  let title = '';
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  const contentTitle = (stepId: ContentStepId, label: string) => {
    const idx = CONTENT_STEPS.findIndex((s) => s.id === stepId);
    return `Schritt ${idx + 1}/${CONTENT_STEPS.length} · ${label}`;
  };

  const navFooter = (isFirst: boolean) => (
    <div className="dialog-actions">
      <button type="button" className="btn secondary" onClick={cancel}>Abbrechen</button>
      {!isFirst ? <button type="button" className="btn secondary" onClick={goBack}>Zurück</button> : null}
      <button type="button" className="btn" onClick={goNext}>Weiter</button>
    </div>
  );

  if (view.kind === 'content') {
    const step = CONTENT_STEPS[view.index];
    footer = navFooter(view.index === 0);
    if (step.id === 'beschreibung') {
      title = contentTitle('beschreibung', 'Artikelbeschreibung');
      body = (
        <div className="review-dialog__contract-fields">
          <div className="contract-field-row">
            <label className="contract-field-row__label" htmlFor="wizard-artikelbeschreibung">
              <span className="contract-field-row__key">Artikelbeschreibung</span>
            </label>
            <div className="contract-field-row__input-row">
              <textarea
                id="wizard-artikelbeschreibung"
                className="contract-field-row__input"
                rows={3}
                value={artikelbeschreibung}
                onChange={(e) => setArtikelbeschreibung(e.target.value)}
              />
            </div>
          </div>
        </div>
      );
    } else if (step.id === 'kurztext') {
      title = contentTitle('kurztext', 'Kurztext');
      body = (
        <div className="review-dialog__contract-fields">
          <div className="contract-field-row">
            <label className="contract-field-row__label" htmlFor="wizard-kurztext">
              <span className="contract-field-row__key">Kurztext</span>
            </label>
            <div className="contract-field-row__input-row">
              <textarea
                id="wizard-kurztext"
                className="contract-field-row__input"
                rows={4}
                value={kurzbeschreibung}
                onChange={(e) => setKurzbeschreibung(e.target.value)}
              />
            </div>
          </div>
        </div>
      );
    } else if (step.id === 'spezifikationen') {
      title = contentTitle('spezifikationen', 'Spezifikationen');
      body = data.specFields.length === 0 ? (
        <p className="muted">Keine Spezifikationen vorhanden.</p>
      ) : (
        <div className="review-dialog__contract-fields">
          {data.specFields.map((field) => {
            const isConflict = field.intakeValue != null && field.value !== '' && field.value !== field.intakeValue;
            const isEmpty = !(specValues[field.key] ?? '').trim();
            return (
              <div
                key={field.key}
                className={[
                  'contract-field-row',
                  field.required ? 'contract-field-row--required' : 'contract-field-row--desired',
                  isEmpty ? 'contract-field-row--empty' : ''
                ].filter(Boolean).join(' ')}
              >
                <label className="contract-field-row__label" htmlFor={`wizard-spec-${field.key}`}>
                  <span className="contract-field-row__key">{field.key}</span>
                  {field.required ? <span className="contract-field-row__badge contract-field-row__badge--required">Pflicht</span> : null}
                  {field.description ? <span className="contract-field-row__desc">{field.description}</span> : null}
                </label>
                {isConflict ? (
                  <div className="contract-field-row__conflict-hint">
                    <span>Erfassung: <em>{field.intakeValue}</em></span>
                  </div>
                ) : null}
                <div className="contract-field-row__input-row">
                  <input
                    id={`wizard-spec-${field.key}`}
                    type="text"
                    className="contract-field-row__input"
                    value={specValues[field.key] ?? ''}
                    placeholder={isEmpty ? '(leer — Feld wird entfernt)' : ''}
                    onChange={(e) => updateSpec(field.key, e.target.value)}
                  />
                  {!isEmpty ? (
                    <button
                      type="button"
                      className="contract-field-row__remove"
                      title="Feld entfernen"
                      onClick={() => updateSpec(field.key, '')}
                    >✕</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else if (step.id === 'dimensionen') {
      title = contentTitle('dimensionen', 'Dimensionen');
      body = (
        <div className="review-dialog__contract-fields">
          {numberField('laenge', 'Länge (mm)', laenge, setLaenge)}
          {numberField('breite', 'Breite (mm)', breite, setBreite)}
          {numberField('hoehe', 'Höhe (mm)', hoehe, setHoehe)}
          {numberField('gewicht', 'Gewicht (kg)', gewicht, setGewicht)}
        </div>
      );
    } else {
      title = contentTitle('preis', 'Preis');
      body = (
        <div className="review-dialog__contract-fields">
          {numberField('preis', 'Verkaufspreis', price, setPrice, 'z. B. 199.99')}
        </div>
      );
    }
    body = <>{body}{stepNoteInput(step.id)}</>;
  } else if (view.kind === 'summary') {
    title = 'Zusammenfassung · Entscheid';
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Artikelbeschreibung', value: artikelbeschreibung },
      { label: 'Kurztext', value: kurzbeschreibung },
      ...data.specFields
        .map((f) => ({ label: f.key, value: specValues[f.key] ?? '' }))
        .filter((r) => r.value.trim()),
      { label: 'Länge (mm)', value: laenge },
      { label: 'Breite (mm)', value: breite },
      { label: 'Höhe (mm)', value: hoehe },
      { label: 'Gewicht (kg)', value: gewicht },
      { label: 'Verkaufspreis', value: price }
    ];
    const collectedNotes = CONTENT_STEPS
      .map((s) => ({ label: s.label, note: (notes[s.id] ?? '').trim() }))
      .filter((n) => n.note);
    body = (
      <>
        <div className="review-wizard__summary">
          {rows.map((row) => (
            <div key={row.label} className="review-wizard__summary-row">
              <span className="review-wizard__summary-label">{row.label}</span>
              <span className="review-wizard__summary-value">{row.value.trim() || <em className="muted">—</em>}</span>
            </div>
          ))}
        </div>
        {collectedNotes.length > 0 ? (
          <div className="review-wizard__summary-notes">
            <span className="contract-field-row__key">Notizen</span>
            <ul>
              {collectedNotes.map((n) => <li key={n.label}><strong>{n.label}:</strong> {n.note}</li>)}
            </ul>
          </div>
        ) : null}
        {stepNoteInput('zusammenfassung')}
      </>
    );
    footer = (
      <div className="dialog-actions">
        <button type="button" className="btn secondary" onClick={cancel}>Abbrechen</button>
        <button type="button" className="btn secondary" onClick={goBack}>Zurück</button>
        <button type="button" className="btn btn--danger" onClick={() => resolveWith('rejected')}>Ablehnen</button>
        <button type="button" className="btn" onClick={() => setView({ kind: 'shop' })}>Freigeben</button>
      </div>
    );
  } else {
    title = 'Shop';
    body = (
      <>
        <p>Artikel in den Shop stellen?</p>
        <div className="review-wizard__shop-choice">
          <label>
            <input type="radio" name="wizard-shop" checked={shopArticle} onChange={() => setShopArticle(true)} /> Ja, in den Shop
          </label>
          <label>
            <input type="radio" name="wizard-shop" checked={!shopArticle} onChange={() => setShopArticle(false)} /> Nein
          </label>
        </div>
        {stepNoteInput('shop')}
      </>
    );
    footer = (
      <div className="dialog-actions">
        <button type="button" className="btn secondary" onClick={goBack}>Zurück</button>
        <button type="button" className="btn" onClick={() => resolveWith('approved')}>Freigeben &amp; abschliessen</button>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" role="presentation" onClick={cancel}>
      <div
        className="dialog-content review-dialog review-dialog--wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agentic-review-wizard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title" id="agentic-review-wizard-title">{title}</h2>
        {body}
        {footer}
      </div>
    </div>
  );
}

export default AgenticReviewWizard;
