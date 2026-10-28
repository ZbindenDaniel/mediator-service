import React, { useState } from 'react';
import BoxSearchInput from '../BoxSearchInput';
import RefSearchInput, { type RefSuggestion } from '../RefSearchInput';
import { ensureUser } from '../../lib/user';

// "Entnehmen" on the Einzelteile page: the one way a part leaves its device. A part without an
// article gets one right here (new, prefilled from the part, or an existing one), so nothing
// article-less ever ends up in stock (POST …/remove-from-device; plain relocation refuses it).

interface Props {
  itemUUID: string;
  /** Set when the part already has an article: then only the box is asked. */
  artikelNummer: string | null;
  partLabel: string;
  deviceLabel: string;
  targetSubcategory: number | null;
  /** The part number from the part's own assessment, carried into a new article. */
  fru: string | null;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}

type ArticleMode = 'new' | 'existing';

export default function PartRemovalForm({ itemUUID, artikelNummer, partLabel, deviceLabel, targetSubcategory, fru, onDone, onCancel }: Props) {
  const [boxId, setBoxId] = useState('');
  const [mode, setMode] = useState<ArticleMode>('new');
  const [description, setDescription] = useState(`${partLabel} · ${deviceLabel}`);
  const [hersteller, setHersteller] = useState('');
  const [partNumber, setPartNumber] = useState(fru ?? '');
  const [existing, setExisting] = useState<RefSuggestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const submit = async (confirmSubCategoryChange = false) => {
    const actor = await ensureUser();
    if (!actor) return;
    if (!boxId.trim()) { setError('Bitte einen Behälter wählen.'); return; }
    if (!artikelNummer && mode === 'existing' && !existing) { setError('Bitte einen Artikel wählen.'); return; }
    if (!artikelNummer && mode === 'new' && !description.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return; }
    const article = artikelNummer
      ? {}
      : mode === 'existing'
        ? { artikelNummer: existing!.Artikel_Nummer }
        : {
            newRef: {
              Artikelbeschreibung: description.trim(),
              Hersteller: hersteller.trim(),
              ...(targetSubcategory !== null ? { Unterkategorien_A: targetSubcategory } : {}),
              ...(partNumber.trim() ? { Langtext: { FRU: partNumber.trim() } } : {}),
            },
          };
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/remove-from-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor, toBoxId: boxId.trim(), ...article, ...(confirmSubCategoryChange ? { confirmSubCategoryChange: true } : {}) }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; refSubCategory?: number };
      if (res.status === 409 && data.refSubCategory !== undefined) {
        // The chosen article is of another part type than the slot: ask before switching contracts.
        setNeedsConfirm(true);
        setError(data.error ?? 'Andere Kategorie als der Steckplatz.');
        return;
      }
      if (!res.ok) { setError(data.error ?? `Fehler ${res.status}`); return; }
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="part-removal" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h3>Entnehmen</h3>
      <div className="row">
        <label htmlFor="part-removal-box">Behälter</label>
        <BoxSearchInput id="part-removal-box" value={boxId} onValueChange={setBoxId} placeholder="Box-ID oder Standort suchen" disabled={submitting} autoFocus />
      </div>

      {artikelNummer ? (
        <p className="muted">Artikel {artikelNummer}</p>
      ) : (
        <fieldset className="part-removal__article">
          <legend>Artikel für das Teil</legend>
          <div className="part-removal__modes" role="radiogroup">
            <label><input type="radio" name="part-removal-mode" checked={mode === 'new'} onChange={() => setMode('new')} /> Neuer Artikel</label>
            <label><input type="radio" name="part-removal-mode" checked={mode === 'existing'} onChange={() => setMode('existing')} /> Bestehender Artikel</label>
          </div>
          {mode === 'new' ? (
            <>
              <div className="row">
                <label htmlFor="part-removal-desc">Bezeichnung</label>
                <input id="part-removal-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />
              </div>
              <div className="row">
                <label htmlFor="part-removal-hersteller">Hersteller</label>
                <input id="part-removal-hersteller" type="text" value={hersteller} onChange={(e) => setHersteller(e.target.value)} disabled={submitting} />
              </div>
              <div className="row">
                <label htmlFor="part-removal-fru">Teilenummer (FRU)</label>
                <input id="part-removal-fru" type="text" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} disabled={submitting} />
              </div>
            </>
          ) : (
            <div className="row">
              <RefSearchInput placeholder="Artikel suchen…" disabled={submitting} onSelected={setExisting} />
              {existing && <p className="muted">Gewählt: {existing.Artikelbeschreibung ?? existing.Artikel_Nummer} ({existing.Artikel_Nummer})</p>}
            </div>
          )}
        </fieldset>
      )}

      {error && <p className="ptree__error" role="alert">{error}</p>}
      <div className="part-removal__actions">
        {needsConfirm ? (
          <button type="button" className="btn btn--primary" disabled={submitting} onClick={() => void submit(true)}>Trotzdem entnehmen</button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={submitting}>{submitting ? 'Entnimmt…' : 'Entnehmen'}</button>
        )}
        <button type="button" className="btn btn--secondary" disabled={submitting} onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
