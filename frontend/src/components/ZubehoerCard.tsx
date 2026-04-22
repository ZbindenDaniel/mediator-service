import React from 'react';
import RefSearchInput, { type RefSuggestion } from './RefSearchInput';
import ZubehoerBadge from './ZubehoerBadge';
import { usePanelContext } from '../context/PanelContext';

interface ZubehoerCardProps {
  itemUUID: string;
  artikelNummer?: string | null;
  connectedAccessories: any[];
  connectedToDevices: any[];
  compatibleAccessoryRefs: any[];
  compatibleParentRefs: any[];
  onRelationChanged: () => void;
}

export default function ZubehoerCard({
  itemUUID,
  artikelNummer,
  connectedAccessories,
  connectedToDevices,
  compatibleAccessoryRefs,
  compatibleParentRefs,
  onRelationChanged
}: ZubehoerCardProps) {
  const { setEntity } = usePanelContext();
  const [linkInput, setLinkInput] = React.useState('');
  const [linkPending, setLinkPending] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

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
    </div>
  );
}
