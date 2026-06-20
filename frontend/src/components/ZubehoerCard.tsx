import React from 'react';
import RefSearchInput, { type RefSuggestion } from './RefSearchInput';
import ZubehoerBadge from './ZubehoerBadge';
import SparepartSlotPopup from './SparepartSlotPopup';
import { usePanelContext } from '../context/PanelContext';
import type { DisassemblyContract, DisassemblyContractPart } from '../../../models/disassembly-contract';
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

type SlotState = 'potential' | 'empty' | 'cataloged' | 'removed';

function deriveSlotState(
  part: DisassemblyContractPart,
  spareParts: SparePart[],
  qualityResponses: Record<string, string>
): { state: SlotState; sparePart: SparePart | null } {
  const linked = spareParts.find(sp => sp.slotKey === part.key) ?? null;
  if (linked) {
    return { state: linked.BoxID ? 'removed' : 'cataloged', sparePart: linked };
  }
  const q = part.qualityQuestion;
  if (q) {
    const answer = qualityResponses[q.id];
    if (answer === 'false' || answer === 'Nicht vorhanden') {
      return { state: 'empty', sparePart: null };
    }
  }
  return { state: 'potential', sparePart: null };
}

interface ZubehoerCardProps {
  itemUUID: string;
  artikelNummer?: string | null;
  deviceLabel?: string | null;
  deviceHersteller?: string | null;
  connectedAccessories: any[];
  connectedToDevices: any[];
  compatibleAccessoryRefs: any[];
  compatibleParentRefs: any[];
  onRelationChanged: () => void;
  disassemblyContract?: DisassemblyContract | null;
  spareParts?: SparePart[];
  qualityResponses?: Record<string, string>;
  onSparepartChanged?: () => void;
}

export default function ZubehoerCard({
  itemUUID,
  artikelNummer,
  deviceLabel,
  deviceHersteller,
  connectedAccessories,
  connectedToDevices,
  compatibleAccessoryRefs,
  compatibleParentRefs,
  onRelationChanged,
  disassemblyContract,
  spareParts = [],
  qualityResponses = {},
  onSparepartChanged
}: ZubehoerCardProps) {
  const { setEntity } = usePanelContext();
  const [linkInput, setLinkInput] = React.useState('');
  const [linkPending, setLinkPending] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  // Slot for the open Hinzufügen popup (key of the part, or null if closed)
  const [openPopupSlot, setOpenPopupSlot] = React.useState<string | null>(null);
  // Slot for the open Entnehmen form
  const [removeSlotKey, setRemoveSlotKey] = React.useState<string | null>(null);
  const [removeBoxInput, setRemoveBoxInput] = React.useState('');
  const [removePending, setRemovePending] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  const [localCompatRefs, setLocalCompatRefs] = React.useState<any[]>(compatibleAccessoryRefs);
  const [localParentRefs, setLocalParentRefs] = React.useState<any[]>(compatibleParentRefs);
  const [refPending, setRefPending] = React.useState(false);
  const [refError, setRefError] = React.useState<string | null>(null);

  React.useEffect(() => { setLocalCompatRefs(compatibleAccessoryRefs); }, [compatibleAccessoryRefs]);
  React.useEffect(() => { setLocalParentRefs(compatibleParentRefs); }, [compatibleParentRefs]);

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

  return (
    <div className="card grid-span-2">
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
                        <button type="button" className="sml-btn btn" onClick={() => handleRemoveCompatRef(ref.Artikel_Nummer)} title="Kompatibilität entfernen">✕</button>
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
                        <button type="button" className="sml-btn btn" onClick={() => handleRemoveParentRef(ref.Artikel_Nummer)} title="Zugehörigkeit entfernen">✕</button>
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

      {disassemblyContract && disassemblyContract.parts.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Zerlegen</h3>
          <table className="details" style={{ position: 'relative' }}>
            <tbody>
              {disassemblyContract.parts.map((part) => {
                const { state, sparePart } = deriveSlotState(part, spareParts, qualityResponses);
                const isRemoveOpen = removeSlotKey === part.key;
                return (
                  <React.Fragment key={part.key}>
                    <tr>
                      <td style={{ width: '28px' }}>
                        {state === 'cataloged' && <span title="Im Gerät (katalogisiert)" style={{ color: 'var(--color-orange, #f0a030)' }}>◉</span>}
                        {state === 'removed' && <span title="Entnommen" style={{ color: 'var(--color-muted, #888)' }}>○</span>}
                        {state === 'potential' && <span title="Unbekannt / vorhanden" style={{ color: 'var(--color-green, #4caf50)' }}>◎</span>}
                        {state === 'empty' && <span title="Nicht vorhanden" style={{ color: 'var(--color-error, #d73a49)' }}>✕</span>}
                      </td>
                      <td>
                        <strong>{part.label}</strong>
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
                        {state === 'empty' && (
                          <span className="muted"> · Nicht vorhanden (laut Qualitätsprüfung)</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(state === 'potential' || state === 'empty') && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              type="button"
                              className="btn sml-btn"
                              onClick={() => setOpenPopupSlot(openPopupSlot === part.key ? null : part.key)}
                            >
                              Hinzufügen
                            </button>
                            {openPopupSlot === part.key && (
                              <SparepartSlotPopup
                                deviceItemUUID={itemUUID}
                                deviceLabel={deviceLabel || itemUUID}
                                deviceHersteller={deviceHersteller}
                                slotKey={part.key}
                                slotLabel={part.label}
                                onComplete={() => {
                                  setOpenPopupSlot(null);
                                  onSparepartChanged?.();
                                }}
                                onClose={() => setOpenPopupSlot(null)}
                              />
                            )}
                          </div>
                        )}
                        {state === 'cataloged' && (
                          <button
                            type="button"
                            className="btn sml-btn"
                            onClick={() => {
                              setRemoveSlotKey(isRemoveOpen ? null : part.key);
                              setRemoveBoxInput('');
                              setRemoveError(null);
                            }}
                          >
                            {isRemoveOpen ? 'Abbrechen' : 'Entnehmen'}
                          </button>
                        )}
                        {state === 'cataloged' && sparePart && (
                          <button
                            type="button"
                            className="btn sml-btn"
                            style={{ marginLeft: '4px' }}
                            title="Verknüpfung aufheben und Instanz löschen"
                            onClick={async () => {
                              const actor = await ensureUser();
                              if (!actor) return;
                              const ok = confirm(`Eintrag für ${part.label} löschen?`);
                              if (!ok) return;
                              try {
                                await fetch(`/api/items/${encodeURIComponent(sparePart.ItemUUID)}/spare-part-link`, { method: 'DELETE' });
                                onSparepartChanged?.();
                              } catch { /* noop */ }
                            }}
                          >
                            Lösen
                          </button>
                        )}
                      </td>
                    </tr>
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
                            <button type="submit" className="btn btn--primary sml-btn" disabled={removePending || !removeBoxInput.trim()}>
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
    </div>
  );
}
