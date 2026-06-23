import React from 'react';
import ReactDOM from 'react-dom';
import RefSearchInput, { type RefSuggestion } from './RefSearchInput';
import ZubehoerBadge from './ZubehoerBadge';
import SparepartSlotPopup from './SparepartSlotPopup';
import { usePanelContext } from '../context/PanelContext';
import type { AssemblyContract, AssemblyPart } from '../../../models/assembly-contract';
import type { QualityQuestion } from '../../../models/quality-contract';
import { getUser, ensureUser } from '../lib/user';

interface SparePart {
  ItemUUID: string;
  slotKey: string | null;
  Artikel_Nummer: string | null;
  BoxID: string | null;
  Location: string | null;
  Artikelbeschreibung?: string | null;
  Kurzbeschreibung?: string | null;
}

// Extended from 'potential'/'empty'/'cataloged'/'removed' — now distinguishes unknown from confirmed-present
type SlotState = 'unknown' | 'present' | 'empty' | 'cataloged' | 'removed';

function getPartQuestion(part: AssemblyPart): QualityQuestion | undefined {
  return part.question ?? part.qualityQuestion;
}

function deriveSlotState(
  part: AssemblyPart,
  spareParts: SparePart[],
  qualityResponses: Record<string, string>
): { state: SlotState; sparePart: SparePart | null } {
  // Prefer last cataloged instance matching this slot key
  const linked = spareParts.filter(sp => sp.slotKey === part.key);
  const activePart = linked.find(sp => !sp.BoxID) ?? linked[linked.length - 1] ?? null;
  if (activePart) {
    return { state: activePart.BoxID ? 'removed' : 'cataloged', sparePart: activePart };
  }
  const q = getPartQuestion(part);
  if (q) {
    const answer = qualityResponses[q.id];
    if (answer === 'false' || answer === 'Nicht vorhanden') {
      return { state: 'empty', sparePart: null };
    }
    if (answer !== undefined) {
      return { state: 'present', sparePart: null };
    }
  }
  return { state: 'unknown', sparePart: null };
}

/** Derives a spec label and specs object from quality answers for a given part. */
function deriveSpecForSlot(
  part: AssemblyPart,
  qualityResponses: Record<string, string>
): { label: string; specs: Record<string, string> } | null {
  const q = getPartQuestion(part);
  if (!q?.specField || !q.specValue) return null;
  const answer = qualityResponses[q.id];
  if (!answer || answer === 'false' || answer === 'Nicht vorhanden') return null;
  const value = q.specValue.replace('%v', answer);
  const specs: Record<string, string> = { [q.specField]: value };
  // Also include secondary specQuestion if present and answered
  if (part.specQuestion?.specField && part.specQuestion.specValue) {
    const sqAnswer = qualityResponses[part.specQuestion.id];
    if (sqAnswer) {
      specs[part.specQuestion.specField] = part.specQuestion.specValue.replace('%v', sqAnswer);
    }
  }
  return { label: value, specs };
}

interface ZubehoerCardProps {
  itemUUID: string;
  artikelNummer?: string | null;
  deviceLabel?: string | null;
  deviceHersteller?: string | null;
  subCategory?: number | null;
  connectedAccessories: any[];
  connectedToDevices: any[];
  compatibleAccessoryRefs: any[];
  compatibleParentRefs: any[];
  onRelationChanged: () => void;
  assemblyContract?: AssemblyContract | null;
  /** @deprecated use assemblyContract */
  disassemblyContract?: AssemblyContract | null;
  spareParts?: SparePart[];
  qualityResponses?: Record<string, string>;
  onSparepartChanged?: () => void;
  onQualityResponseChanged?: (responses: Record<string, string>) => void;
}

export default function ZubehoerCard({
  itemUUID,
  artikelNummer,
  deviceLabel,
  deviceHersteller,
  subCategory,
  connectedAccessories,
  connectedToDevices,
  compatibleAccessoryRefs,
  compatibleParentRefs,
  onRelationChanged,
  assemblyContract: assemblyContractProp,
  disassemblyContract,
  spareParts = [],
  qualityResponses = {},
  onSparepartChanged,
  onQualityResponseChanged
}: ZubehoerCardProps) {
  const { setEntity } = usePanelContext();
  const assemblyContract = assemblyContractProp ?? disassemblyContract ?? null;

  const [linkInput, setLinkInput] = React.useState('');
  const [linkPending, setLinkPending] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const [openPopupSlot, setOpenPopupSlot] = React.useState<string | null>(null);
  const [removeSlotKey, setRemoveSlotKey] = React.useState<string | null>(null);
  const [removeBoxInput, setRemoveBoxInput] = React.useState('');
  const [removePending, setRemovePending] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  const [localCompatRefs, setLocalCompatRefs] = React.useState<any[]>(compatibleAccessoryRefs);
  const [localParentRefs, setLocalParentRefs] = React.useState<any[]>(compatibleParentRefs);
  const [refPending, setRefPending] = React.useState(false);
  const [refError, setRefError] = React.useState<string | null>(null);

  // Inline quality answer state: slotKey → pending answer value being saved
  const [answerPending, setAnswerPending] = React.useState<string | null>(null);

  React.useEffect(() => { setLocalCompatRefs(compatibleAccessoryRefs); }, [compatibleAccessoryRefs]);
  React.useEffect(() => { setLocalParentRefs(compatibleParentRefs); }, [compatibleParentRefs]);

  /** Save a single quality answer inline from a slot row. */
  async function handleSlotAnswer(questionId: string, value: string) {
    const actor = await ensureUser();
    if (!actor) return;
    setAnswerPending(questionId);
    try {
      const merged = { ...qualityResponses, [questionId]: value };
      const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/quality-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: merged, reviewed_by: actor, subCategory: subCategory ?? undefined })
      });
      if (res.ok) {
        onQualityResponseChanged?.(merged);
      }
    } catch { /* noop */ } finally {
      setAnswerPending(null);
    }
  }

  /** One-click Erfassen when the ref is already known. */
  async function handleDirectErfassen(part: AssemblyPart, knownRef: any) {
    const actor = await ensureUser();
    if (!actor) return;
    const specResult = deriveSpecForSlot(part, qualityResponses);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/spare-parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artikelNummer: knownRef.Artikel_Nummer,
          actor,
          slotKey: part.key,
          instanceSpecs: specResult?.specs ?? null
        })
      });
      if (res.ok) {
        onSparepartChanged?.();
      }
    } catch { /* noop */ }
  }

  async function handleAddCompatRef(ref: RefSuggestion) {
    if (!artikelNummer) return;
    setRefPending(true);
    setRefError(null);
    try {
      const res = await fetch(`/api/ref/${encodeURIComponent(artikelNummer)}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childArtikelNummer: ref.Artikel_Nummer })
      });
      if (res.ok) {
        setLocalCompatRefs((prev) => [...prev, { ...ref, availableCount: 0 }]);
      } else {
        const err = await res.json().catch(() => ({}));
        setRefError((err as any).error || 'Fehler beim Hinzufügen');
      }
    } catch {
      setRefError('Netzwerkfehler');
    } finally {
      setRefPending(false);
    }
  }

  async function handleRemoveCompatRef(childArtikelNummer: string) {
    if (!artikelNummer) return;
    try {
      await fetch(`/api/ref/${encodeURIComponent(artikelNummer)}/relations/${encodeURIComponent(childArtikelNummer)}`, { method: 'DELETE' });
      setLocalCompatRefs((prev) => prev.filter((r) => r.Artikel_Nummer !== childArtikelNummer));
    } catch { /* noop */ }
  }

  async function handleAddParentRef(ref: RefSuggestion) {
    if (!artikelNummer) return;
    setRefPending(true);
    setRefError(null);
    try {
      const res = await fetch(`/api/ref/${encodeURIComponent(ref.Artikel_Nummer)}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childArtikelNummer: artikelNummer })
      });
      if (res.ok) {
        setLocalParentRefs((prev) => [...prev, { ...ref }]);
      } else {
        const err = await res.json().catch(() => ({}));
        setRefError((err as any).error || 'Fehler beim Hinzufügen');
      }
    } catch {
      setRefError('Netzwerkfehler');
    } finally {
      setRefPending(false);
    }
  }

  async function handleRemoveParentRef(parentArtikelNummer: string) {
    if (!artikelNummer) return;
    try {
      await fetch(`/api/ref/${encodeURIComponent(parentArtikelNummer)}/relations/${encodeURIComponent(artikelNummer)}`, { method: 'DELETE' });
      setLocalParentRefs((prev) => prev.filter((r) => r.Artikel_Nummer !== parentArtikelNummer));
    } catch { /* noop */ }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    const uuid = linkInput.trim();
    if (!uuid) return;
    setLinkPending(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/item/${encodeURIComponent(itemUUID)}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childItemUUID: uuid })
      });
      if (res.ok) {
        setLinkInput('');
        onRelationChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        setLinkError((err as any).error || 'Fehler beim Verknüpfen');
      }
    } catch {
      setLinkError('Netzwerkfehler');
    } finally {
      setLinkPending(false);
    }
  }

  async function handleUnlink(childItemUUID: string) {
    try {
      await fetch(`/api/item/${encodeURIComponent(itemUUID)}/relations/${encodeURIComponent(childItemUUID)}`, { method: 'DELETE' });
      onRelationChanged();
    } catch { /* noop */ }
  }

  /** Clears a quality answer locally and on the backend (empty string clears the key). */
  async function handleClearAnswer(questionId: string) {
    const actor = await ensureUser();
    if (!actor) return;
    const next = { ...qualityResponses };
    delete next[questionId];
    // Optimistically clear locally; POST the cleaned set to persist
    onQualityResponseChanged?.(next);
    try {
      await fetch(`/api/items/${encodeURIComponent(itemUUID)}/quality-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: next, reviewed_by: actor, subCategory: subCategory ?? undefined })
      });
    } catch { /* noop — local state already updated */ }
  }

  /** Renders a compact inline widget for answering a quality question. */
  function renderInlineQuestion(q: QualityQuestion, currentAnswer: string | undefined) {
    const pending = answerPending === q.id;
    if (q.type === 'boolean') {
      return (
        <span className="quality-review-step__toggle-group" style={{ marginLeft: '8px' }}>
          <button
            type="button"
            className={`quality-review-step__toggle${currentAnswer === 'true' ? ' quality-review-step__toggle--active' : ''}`}
            disabled={pending}
            onClick={() => handleSlotAnswer(q.id, 'true')}
          >Ja</button>
          <button
            type="button"
            className={`quality-review-step__toggle${currentAnswer === 'false' ? ' quality-review-step__toggle--active' : ''}`}
            disabled={pending}
            onClick={() => handleSlotAnswer(q.id, 'false')}
          >Nein</button>
        </span>
      );
    }
    if (q.type === 'select' && q.values) {
      return (
        <select
          value={currentAnswer ?? ''}
          disabled={pending}
          onChange={(e) => { if (e.target.value) handleSlotAnswer(q.id, e.target.value); }}
          style={{ marginLeft: '8px', fontSize: '0.82em', padding: '2px 4px', maxWidth: '140px' }}
        >
          <option value="">–</option>
          {q.values.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }
    return null;
  }

  return (
    <div className="card grid-span-2">

      {/* ── Section 1: Assembly component slots (primary) ─────────────────── */}
      {assemblyContract && assemblyContract.parts.length > 0 && (
        <>
          <h3>Komponenten</h3>
          <table className="details" style={{ position: 'relative' }}>
            <tbody>
              {assemblyContract.parts.map((part) => {
                const { state, sparePart } = deriveSlotState(part, spareParts, qualityResponses);
                const isRemoveOpen = removeSlotKey === part.key;
                const q = getPartQuestion(part);
                const currentAnswer = q ? qualityResponses[q.id] : undefined;
                const specResult = deriveSpecForSlot(part, qualityResponses);

                // Find a known ref for one-click Erfassen: Ersatzteil relation matching targetSubcategory
                const knownRef = localCompatRefs.find(
                  (r: any) => r.RelationType === 'Ersatzteil' && r.SubCategory === part.targetSubcategory
                ) ?? null;

                // noLink parts (e.g. storage) only show spec answers, no item linking
                const canErfassen = !part.noLink && (state === 'unknown' || state === 'present' || state === 'empty' || state === 'removed');

                return (
                  <React.Fragment key={part.key}>
                    <tr>
                      <td style={{ width: '28px' }}>
                        {state === 'cataloged' && <span title="Im Gerät (katalogisiert)" style={{ color: 'var(--color-orange, #f0a030)' }}>◉</span>}
                        {state === 'removed' && <span title="Entnommen" style={{ color: 'var(--color-muted, #888)' }}>○</span>}
                        {state === 'present' && <span title="Vorhanden (noch nicht katalogisiert)" style={{ color: 'var(--color-green, #4caf50)' }}>◎</span>}
                        {state === 'unknown' && <span title="Unbekannt" style={{ color: 'var(--color-muted, #ccc)' }}>⬜</span>}
                        {state === 'empty' && <span title="Nicht vorhanden" style={{ color: 'var(--color-error, #d73a49)' }}>✕</span>}
                      </td>
                      <td>
                        <strong>{part.label}</strong>
                        {/* Linked item name */}
                        {sparePart && (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setEntity('item', sparePart.ItemUUID)}
                            >
                              {sparePart.Artikelbeschreibung || sparePart.Kurzbeschreibung || sparePart.Artikel_Nummer || sparePart.ItemUUID}
                            </button>
                            {state === 'removed' && sparePart.Location && (
                              <span className="muted"> · {sparePart.Location}</span>
                            )}
                          </>
                        )}
                        {/* Spec label from quality */}
                        {specResult && !sparePart && (
                          <span className="muted" style={{ marginLeft: '6px' }}>{specResult.label}</span>
                        )}
                        {/* Empty state: show label + ✎ reset button */}
                        {state === 'empty' && (
                          <>
                            <span className="muted"> · Nicht vorhanden</span>
                            {q && (
                              <button
                                type="button"
                                className="sml-btn btn"
                                style={{ marginLeft: '6px', fontSize: '0.72em', padding: '1px 5px' }}
                                title="Antwort zurücksetzen"
                                onClick={() => handleClearAnswer(q.id)}
                              >✎</button>
                            )}
                          </>
                        )}
                        {/* Inline quality question for unknown/unanswered parts and removed (re-catalog) */}
                        {q && (state === 'unknown' || state === 'removed' || (state === 'present' && !specResult)) && (
                          renderInlineQuestion(q, currentAnswer)
                        )}
                        {/* Show editable select for answered spec questions */}
                        {q && q.type === 'select' && state === 'present' && specResult && (
                          <span style={{ marginLeft: '6px' }}>
                            {renderInlineQuestion(q, currentAnswer)}
                          </span>
                        )}
                        {/* Secondary specQuestion widget (e.g. drive_type for storage) */}
                        {part.specQuestion && (state === 'present' || state === 'unknown' || state === 'removed') && (
                          <span style={{ marginLeft: '4px' }}>
                            {renderInlineQuestion(part.specQuestion, qualityResponses[part.specQuestion.id])}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {/* Erfassen actions */}
                        {canErfassen && knownRef && (
                          <button
                            type="button"
                            className="btn btn--primary"
                            style={{ fontSize: '0.85em' }}
                            onClick={() => handleDirectErfassen(part, knownRef)}
                            title={`Erfassen als ${knownRef.Artikelbeschreibung || knownRef.Artikel_Nummer}`}
                          >
                            Erfassen{specResult ? `: ${specResult.label}` : ''}
                          </button>
                        )}
                        {canErfassen && !knownRef && (
                          <div style={{ display: 'inline-block' }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: '0.85em' }}
                              onClick={() => setOpenPopupSlot(openPopupSlot === part.key ? null : part.key)}
                            >
                              Erfassen{specResult ? `: ${specResult.label}` : ''}
                            </button>
                          </div>
                        )}
                        {/* Entnehmen + Lösen for cataloged */}
                        {state === 'cataloged' && (
                          <>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: '0.85em' }}
                              onClick={() => {
                                setRemoveSlotKey(isRemoveOpen ? null : part.key);
                                setRemoveBoxInput('');
                                setRemoveError(null);
                              }}
                            >
                              {isRemoveOpen ? 'Abbrechen' : 'Entnehmen'}
                            </button>
                            {sparePart && (
                              <button
                                type="button"
                                className="btn"
                                style={{ marginLeft: '4px', fontSize: '0.85em' }}
                                title="Verknüpfung aufheben und Instanz löschen"
                                onClick={async () => {
                                  const actor = await ensureUser();
                                  if (!actor) return;
                                  if (!confirm(`Eintrag für ${part.label} löschen?`)) return;
                                  try {
                                    await fetch(`/api/items/${encodeURIComponent(sparePart.ItemUUID)}/spare-part-link`, { method: 'DELETE' });
                                    onSparepartChanged?.();
                                  } catch { /* noop */ }
                                }}
                              >
                                Lösen
                              </button>
                            )}
                          </>
                        )}
                        {/* For multipleAllowed, allow adding another after one is cataloged */}
                        {part.multipleAllowed && state === 'cataloged' && !openPopupSlot && (
                          <button
                            type="button"
                            className="btn"
                            style={{ marginLeft: '4px', fontSize: '0.75em' }}
                            onClick={() => setOpenPopupSlot(part.key + '_extra')}
                            title="Weiteres Bauteil desselben Typs erfassen"
                          >
                            + weiteres
                          </button>
                        )}
                        {openPopupSlot === part.key + '_extra' && (
                          <SparepartSlotPopup
                            deviceItemUUID={itemUUID}
                            deviceLabel={deviceLabel || itemUUID}
                            deviceHersteller={deviceHersteller}
                            slotKey={part.key}
                            slotLabel={part.label}
                            targetSubcategory={part.targetSubcategory}
                            instanceSpecs={specResult?.specs ?? null}
                            onComplete={() => {
                              setOpenPopupSlot(null);
                              onSparepartChanged?.();
                            }}
                            onClose={() => setOpenPopupSlot(null)}
                          />
                        )}
                      </td>
                    </tr>
                    {/* Entnehmen form row */}
                    {isRemoveOpen && sparePart && (
                      <tr>
                        <td />
                        <td colSpan={2}>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const actor = await ensureUser();
                              if (!actor) return;
                              const toBoxId = removeBoxInput.trim();
                              if (!toBoxId) return;
                              setRemovePending(true);
                              setRemoveError(null);
                              try {
                                const res = await fetch(`/api/items/${encodeURIComponent(sparePart.ItemUUID)}/remove-from-device`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ toBoxId, actor })
                                });
                                if (res.ok) {
                                  setRemoveSlotKey(null);
                                  setRemoveBoxInput('');
                                  onSparepartChanged?.();
                                } else {
                                  const err = await res.json().catch(() => ({}));
                                  setRemoveError((err as any).error || 'Fehler beim Entnehmen');
                                }
                              } catch {
                                setRemoveError('Netzwerkfehler');
                              } finally {
                                setRemovePending(false);
                              }
                            }}
                            style={{ display: 'flex', gap: '6px', alignItems: 'center', paddingBottom: '0.25rem' }}
                          >
                            <input
                              type="text"
                              placeholder="Ziel-Box-ID"
                              value={removeBoxInput}
                              onChange={(e) => setRemoveBoxInput(e.target.value)}
                              style={{ flex: 1, minWidth: '140px' }}
                              disabled={removePending}
                              autoFocus
                            />
                            <button type="submit" className="btn btn--primary" disabled={removePending || !removeBoxInput.trim()}>
                              {removePending ? '…' : 'Entnehmen'}
                            </button>
                            {removeError && <span style={{ color: 'var(--color-error, #d73a49)' }}>{removeError}</span>}
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* ── Section 2: Verbundenes Zubehör ─────────────────────────────────── */}
      {connectedAccessories.length > 0 && (
        <>
          <h3>Verbundenes Zubehör ({connectedAccessories.length})</h3>
          <table className="details">
            <tbody>
              {connectedAccessories.map((acc: any) => (
                <tr key={acc.ItemUUID}>
                  <td><ZubehoerBadge mode="connected" compact /></td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setEntity('item', acc.ItemUUID)}>
                      {acc.Artikelbeschreibung || acc.Kurzbeschreibung || acc.Artikel_Nummer || acc.ItemUUID}
                    </button>
                    {' '}<span className="muted">#{acc.ItemUUID}</span>
                  </td>
                  <td className="muted">{acc.RelationType}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => handleUnlink(acc.ItemUUID)}>Lösen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {connectedToDevices.length > 0 && (
        <>
          <h3>Verbunden mit</h3>
          <table className="details">
            <tbody>
              {connectedToDevices.map((dev: any) => (
                <tr key={dev.ItemUUID}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setEntity('item', dev.ItemUUID)}>
                      {dev.Artikelbeschreibung || dev.Kurzbeschreibung || dev.Artikel_Nummer || dev.ItemUUID}
                    </button>
                    {' '}<span className="muted">#{dev.ItemUUID}</span>
                  </td>
                  <td className="muted">{dev.RelationType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── Section 3: Weitere Verknüpfungen (collapsed) ────────────────────── */}
      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--color-muted, #888)', fontSize: '0.9em' }}>
          Weitere Verknüpfungen
        </summary>
        <div style={{ marginTop: '0.75rem' }}>

          {(artikelNummer || localCompatRefs.length > 0) && (
            <>
              <h3>Passendes Zubehör (Artikeltypen)</h3>
              {localCompatRefs.length > 0 && (
                <table className="details">
                  <tbody>
                    {localCompatRefs.map((ref: any) => (
                      <tr key={ref.Artikel_Nummer}>
                        <td><ZubehoerBadge mode="available" compact /></td>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setEntity('item', ref.Artikel_Nummer)}>
                            {ref.Artikelbeschreibung || ref.Kurzbeschreibung || ref.Artikel_Nummer}
                          </button>
                        </td>
                        <td className="muted">{ref.availableCount ?? 0} auf Lager</td>
                        {artikelNummer && (
                          <td>
                            <button type="button" className="btn" onClick={() => handleRemoveCompatRef(ref.Artikel_Nummer)} title="Kompatibilität entfernen">✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {artikelNummer && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px' }}>
                  <RefSearchInput placeholder="Artikeltyp als Zubehör hinzufügen…" disabled={refPending} onSelected={handleAddCompatRef} />
                  {refError && <span className="muted" style={{ color: 'var(--color-error, #d73a49)', alignSelf: 'center' }}>{refError}</span>}
                </div>
              )}
            </>
          )}

          {(artikelNummer || localParentRefs.length > 0) && (
            <>
              <h3>Gehört zu (Artikeltyp)</h3>
              {localParentRefs.length > 0 && (
                <table className="details">
                  <tbody>
                    {localParentRefs.map((ref: any) => (
                      <tr key={ref.Artikel_Nummer}>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setEntity('item', ref.Artikel_Nummer)}>
                            {ref.Artikelbeschreibung || ref.Kurzbeschreibung || ref.Artikel_Nummer}
                          </button>
                        </td>
                        <td className="muted">{ref.RelationType}</td>
                        {artikelNummer && (
                          <td>
                            <button type="button" className="sbtn" onClick={() => handleRemoveParentRef(ref.Artikel_Nummer)} title="Zugehörigkeit entfernen">✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {artikelNummer && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px' }}>
                  <RefSearchInput placeholder="Gerät hinzufügen, zu dem dieses Zubehör gehört…" disabled={refPending} onSelected={handleAddParentRef} />
                </div>
              )}
            </>
          )}

          <h3>{connectedAccessories.length > 0 ? 'Weiteres Zubehör verknüpfen' : 'Zubehör verknüpfen'}</h3>
          <form onSubmit={handleLink} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="ItemUUID des Zubehörs"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              style={{ flex: 1, minWidth: '200px' }}
              disabled={linkPending}
            />
            <button type="submit" className="btn" disabled={linkPending || !linkInput.trim()}>
              {linkPending ? '…' : 'Verbinden'}
            </button>
          </form>
          {linkError && <p className="muted" style={{ color: 'var(--color-error, #d73a49)', marginTop: '4px' }}>{linkError}</p>}

        </div>
      </details>

      {openPopupSlot !== null && assemblyContract && (() => {
        const part = assemblyContract.parts.find((p) => p.key === openPopupSlot);
        if (!part) return null;
        const specResult = deriveSpecForSlot(part, qualityResponses);
        return ReactDOM.createPortal(
          <div className="dialog-overlay" role="presentation" onClick={() => setOpenPopupSlot(null)}>
            <div
              className="dialog-content"
              role="dialog"
              aria-modal="true"
              aria-label={`${part.label} katalogisieren`}
              onClick={(e) => e.stopPropagation()}
            >
              <SparepartSlotPopup
                deviceItemUUID={itemUUID}
                deviceLabel={deviceLabel || itemUUID}
                deviceHersteller={deviceHersteller}
                slotKey={part.key}
                slotLabel={part.label}
                targetSubcategory={part.targetSubcategory}
                instanceSpecs={specResult?.specs ?? null}
                onComplete={() => {
                  setOpenPopupSlot(null);
                  onSparepartChanged?.();
                }}
                onClose={() => setOpenPopupSlot(null)}
              />
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
