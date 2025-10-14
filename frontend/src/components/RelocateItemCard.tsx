import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GoLinkExternal } from 'react-icons/go';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { createBoxForRelocation, ensureActorOrAlert } from './relocation/relocationHelpers';

interface Props {
  itemId: string;
  onRelocated?: () => void | Promise<void>;
}

export default function RelocateItemCard({ itemId, onRelocated }: Props) {
  const [boxId, setBoxId] = useState('');
  const [status, setStatus] = useState('');
  const [boxLink, setBoxLink] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<BoxSuggestion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRelocateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actor = await ensureActorOrAlert({ context: 'relocate item submit' });
    if (!actor) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setStatus('Artikel verschoben');
        setBoxLink(`/boxes/${encodeURIComponent(boxId)}`);
        console.info('Relocate item succeeded', {
          itemId,
          toBoxId: boxId,
          status: response.status,
          response: data,
          selectedSuggestion
        });
        if (typeof onRelocated === 'function') {
          try {
            await onRelocated();
            console.info('Relocate item onRelocated callback completed', {
              itemId,
              toBoxId: boxId
            });
          } catch (callbackError) {
            console.error('Relocate item onRelocated callback failed', {
              itemId,
              toBoxId: boxId,
              error: callbackError
            });
          }
        }
      } else {
        const errorMessage = 'Fehler: ' + (data.error || response.status);
        setStatus(errorMessage);
        setBoxLink('');
        console.warn('Relocate item failed', {
          itemId,
          toBoxId: boxId,
          status: response.status,
          error: data.error ?? data
        });
      }
    } catch (error) {
      console.error('Relocate item request failed', {
        itemId,
        toBoxId: boxId,
        error
      });
      setStatus('Verschieben fehlgeschlagen');
      setBoxLink('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateBox(): Promise<string | void> {
    const actor = await ensureActorOrAlert({ context: 'relocate item create box' });
    if (!actor) {
      return;
    }

    const result = await createBoxForRelocation({
      actor,
      context: 'relocate item create box'
    });

    if (result.ok && result.boxId) {
      setBoxId(result.boxId);
      setSelectedSuggestion({ BoxID: result.boxId });
      setStatus('Behälter erstellt. Bitte platzieren!');
      setBoxLink(`/boxes/${encodeURIComponent(result.boxId)}`);
      return result.boxId;
    }

    setStatus(result.message ?? 'Behälter anlegen fehlgeschlagen');
    return undefined;
  }

  return (
    <div className="card relocate-card">
      <h3>Artikel umlagern</h3>
      <form onSubmit={handleRelocateSubmit}>
        <div className="row">
          <label htmlFor="relocate-target-box">Ziel Behälter-ID</label>
        </div>
        <div className="row">
          <BoxSearchInput
            id="relocate-target-box"
            value={boxId}
            onValueChange={setBoxId}
            onSuggestionSelected={setSelectedSuggestion}
            placeholder="Box-ID oder Standort suchen"
            allowCreate
            onCreateBox={handleCreateBox}
            disabled={isSubmitting}
          />
        </div>
        <div className="row">
          <div className="row status-row">
            <button type="submit" disabled={isSubmitting || !boxId.trim()}>
              Verschieben
            </button>
            <button type="button" onClick={() => { void handleCreateBox(); }} disabled={isSubmitting}>
              Behälter anlegen
            </button>
          </div>
        </div>
        <div className="row">
          {status ? (
            <div className="status-row">
              <span>{status}</span>
              <span>
                {boxLink ? (
                  <Link to={boxLink} aria-label="Zielbox öffnen">
                    <GoLinkExternal />
                  </Link>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
