import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GoLinkExternal } from 'react-icons/go';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { ensureUser } from '../lib/user';
import { dialogService } from './dialog';

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
    const actor = await ensureUser();
    if (!actor) {
      console.info('Relocate item aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for item relocation', error);
      }
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
    const actor = await ensureUser();
    if (!actor) {
      console.info('Create box aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for box creation', error);
      }
      return;
    }

    try {
      const response = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.id) {
        setBoxId(data.id);
        setSelectedSuggestion({ BoxID: data.id });
        setStatus('Behälter erstellt. Bitte platzieren!');
        setBoxLink(`/boxes/${encodeURIComponent(data.id)}`);
        console.info('Create box succeeded', {
          status: response.status,
          boxId: data.id
        });
        return data.id;
      }

      const errorMessage = 'Fehler: ' + (data.error || response.status);
      setStatus(errorMessage);
      console.warn('Create box failed', {
        status: response.status,
        error: data.error ?? data
      });
    } catch (error) {
      console.error('Create box request failed', error);
      setStatus('Behälter anlegen fehlgeschlagen');
    }
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
