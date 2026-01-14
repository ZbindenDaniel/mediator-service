import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GoLinkExternal } from 'react-icons/go';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { createBoxForRelocation, ensureActorOrAlert } from './relocation/relocationHelpers';
import { dialogService } from './dialog';
// TODO(agent): Remove hardcoded relocation defaults once backend exposes canonical location metadata endpoints.

interface Props {
  itemId: string;
  onRelocated?: () => void | Promise<void>;
}

interface RelocateOptions {
  destinationOverride?: string;
}

// TODO(agent): Confirm backend analytics don't require the default-location relocation flow.
export default function RelocateItemCard({ itemId, onRelocated }: Props) {
  const [boxId, setBoxId] = useState('');
  const [status, setStatus] = useState('');
  const [boxLink, setBoxLink] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<BoxSuggestion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function performRelocate(actor: string, destinationBoxId?: string, options?: RelocateOptions) {
    try {
      const payload: Record<string, unknown> = { actor };
      if (destinationBoxId) {
        payload.toBoxId = destinationBoxId;
      }

      const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      const resolvedDestinationId = data.destinationBoxId ?? destinationBoxId ?? '';
      if (response.ok) {
        setStatus('Artikel verschoben');
        setBoxLink(resolvedDestinationId ? `/boxes/${encodeURIComponent(resolvedDestinationId)}` : '');
        console.info('Relocate item succeeded', {
          itemId,
          toBoxId: resolvedDestinationId || destinationBoxId,
          status: response.status,
          response: data,
          selectedSuggestion
        });
        if (typeof onRelocated === 'function') {
          try {
            await onRelocated();
            console.info('Relocate item onRelocated callback completed', {
              itemId,
              toBoxId: resolvedDestinationId || destinationBoxId
            });
          } catch (callbackError) {
            console.error('Relocate item onRelocated callback failed', {
              itemId,
              toBoxId: resolvedDestinationId || destinationBoxId,
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
          toBoxId: resolvedDestinationId || destinationBoxId,
          status: response.status,
          error: data.error ?? data
        });
      }
    } catch (error) {
      console.error('Relocate item request failed', {
        itemId,
        toBoxId: destinationBoxId,
        error
      });
      setStatus('Verschieben fehlgeschlagen');
      setBoxLink('');
    }
  }

  async function handleRelocateSubmit(event: React.FormEvent<HTMLFormElement>, options?: RelocateOptions) {
    event.preventDefault();
    const actor = await ensureActorOrAlert({ context: 'relocate item submit' });
    if (!actor) {
      return;
    }

    const destinationBoxId = (options?.destinationOverride ?? boxId).trim();
    if (!destinationBoxId) {
      setStatus('Bitte einen Zielbehälter auswählen.');
      setBoxLink('');
      console.warn('Relocate item aborted: missing destination box id', { itemId });
      return;
    }

    if (!options?.destinationOverride) {
      setBoxId(destinationBoxId);
    }

    setIsSubmitting(true);
    try {
      await performRelocate(actor, destinationBoxId, options);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createBox(actor: string): Promise<string | undefined> {
    try {
      const response = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.id) {
        setStatus('Neuer Behälter erstellt, verschiebe...');
        setBoxLink(`/boxes/${encodeURIComponent(data.id)}`);
        console.info('Create box succeeded', {
          status: response.status,
          boxId: data.id
        });
        return data.id;
      }

      const errorMessage = 'Fehler: ' + (data.error || response.status);
      setStatus(errorMessage);
      setBoxLink('');
      console.warn('Create box failed', {
        status: response.status,
        error: data.error ?? data
      });
    } catch (error) {
      console.error('Create box request failed', error);
      setStatus('Behälter anlegen fehlgeschlagen');
      setBoxLink('');
    }
    return undefined;
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

  async function handleCreateBoxAndRelocate() {
    if (isSubmitting) {
      return;
    }

    const actor = await ensureActorOrAlert({ context: 'relocate item create box' });
    if (!actor) {
      console.info('Create box and relocate aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for create and relocate flow', error);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const newBoxId = await createBox(actor);
      if (!newBoxId) {
        console.warn('Create box and relocate skipped: box creation failed', { itemId });
        return;
      }

      setBoxId(newBoxId);
      setSelectedSuggestion({ BoxID: newBoxId });
      await performRelocate(actor, newBoxId);
      console.info('Create box and relocate flow completed', {
        itemId,
        toBoxId: newBoxId
      });
    } catch (error) {
      console.error('Create box and relocate flow failed', {
        itemId,
        error
      });
      setStatus('Verschieben fehlgeschlagen');
      setBoxLink('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Artikel umlagern</h3>
      <form onSubmit={handleRelocateSubmit}>
        <div className="row">
          <label htmlFor="relocate-target-box">Ziel wählen</label>
        </div>
        <div className="row">
          <BoxSearchInput
            id="relocate-target-box"
            value={boxId}
            onValueChange={setBoxId}
            onSuggestionSelected={setSelectedSuggestion}
            placeholder="Box-ID oder Standort suchen"
            disabled={isSubmitting}
          />
        </div>

        <div className="row">
          <div className="button-group">
            <button
              type="submit"
              className="icon-button"
              disabled={isSubmitting || !boxId.trim()}
              title="Artikel in den ausgewählten Behälter verschieben"
            >
              {/* <GoMoveToEnd aria-hidden="true" /> */}
              <span>Verschieben</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                void handleCreateBoxAndRelocate();
              }}
              disabled={isSubmitting}
              title="Neuen Behälter erstellen und Artikel sofort verschieben"
            >
              {/* <GoPackageDependents aria-hidden="true" /> */}
              <span>In neuen Behälter verschieben</span>
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
