import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { shelfLocations } from '../data/shelfLocations';
import { ensureUser } from '../lib/user';
import { logger, logError } from '../utils/logger';
import { dialogService } from './dialog';

// TODO(agent): Confirm shelf creation copy once warehouse naming conventions are finalized.
// TODO(agent): Remove stale category references from any shelf-create docs and screenshots.
// TODO(agent): Review shelf label/notes defaults once shelf creation UX is finalized.

interface ShelfCreateResponse {
  ok?: boolean;
  id?: string;
  error?: string;
}

export default function ShelfCreateForm() {
  const [location, setLocation] = useState('');
  const [floor, setFloor] = useState('');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [mintedId, setMintedId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locationLookup = useMemo(() => new Map(shelfLocations.map((entry) => [entry.id, entry])), []);
  const activeLocation = locationLookup.get(location);
  const floorOptions = activeLocation?.floors ?? [];

  useEffect(() => {
    if (!location) {
      setFloor('');
      return;
    }

    if (floorOptions.length === 0) {
      setFloor('');
      return;
    }

    if (!floorOptions.includes(floor)) {
      setFloor(floorOptions[0]);
    }
  }, [floor, floorOptions, location]);

  useEffect(() => {
    if (!location) {
      return;
    }

    if (!activeLocation) {
      logger.warn('[shelf-create] Unknown location selection', {
        location,
        availableLocations: shelfLocations.map((entry) => entry.id)
      });
    }
  }, [activeLocation, location]);

  useEffect(() => {
    if (!location || !floor) {
      return;
    }

    if (!floorOptions.includes(floor)) {
      logger.warn('[shelf-create] Invalid floor selection', {
        location,
        floor,
        availableFloors: floorOptions
      });
    }
  }, [floor, floorOptions, location]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedLocation = location.trim();
    const selectedFloor = floor.trim();
    const trimmedLabel = label.trim();
    const trimmedNotes = notes.trim();

    if (!selectedLocation || !selectedFloor) {
      setStatus('Bitte Standort und Ebene auswählen.');
      logger.warn('[shelf-create] Missing selection before submit', {
        selectedLocation,
        selectedFloor
      });
      try {
        await dialogService.alert({
          title: 'Eingaben fehlen',
          message: 'Bitte Standort und Ebene auswählen.'
        });
      } catch (error) {
        logError('Failed to display missing selection alert for shelf creation', error);
      }
      return;
    }

    if (!activeLocation) {
      setStatus('Ungültiger Standort ausgewählt.');
      logger.warn('[shelf-create] Invalid location before submit', {
        selectedLocation
      });
      try {
        await dialogService.alert({
          title: 'Ungültiger Standort',
          message: 'Bitte einen gültigen Standort auswählen.'
        });
      } catch (error) {
        logError('Failed to display invalid location alert for shelf creation', error, {
          selectedLocation
        });
      }
      return;
    }

    if (!floorOptions.includes(selectedFloor)) {
      setStatus('Ungültige Ebene ausgewählt.');
      logger.warn('[shelf-create] Invalid floor before submit', {
        selectedLocation,
        selectedFloor,
        availableFloors: floorOptions
      });
      try {
        await dialogService.alert({
          title: 'Ungültige Ebene',
          message: 'Bitte eine gültige Ebene auswählen.'
        });
      } catch (error) {
        logError('Failed to display invalid floor alert for shelf creation', error, {
          selectedLocation,
          selectedFloor
        });
      }
      return;
    }

    let actor: string | undefined;
    try {
      actor = await ensureUser({
        title: 'Benutzername',
        message: 'Bitte geben Sie Ihren Benutzernamen für die Regal-Erstellung ein:'
      });
    } catch (error) {
      logError('Failed to resolve user for shelf creation', error, {
        selectedLocation,
        selectedFloor,
      });
      setStatus('Benutzer konnte nicht geladen werden.');
      try {
        await dialogService.alert({
          title: 'Benutzer fehlt',
          message: 'Der Benutzer konnte nicht geladen werden. Bitte erneut versuchen.'
        });
      } catch (dialogError) {
        logError('Failed to display user lookup alert for shelf creation', dialogError);
      }
      return;
    }

    if (!actor) {
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        logError('Failed to display missing user alert for shelf creation', error);
      }
      return;
    }

    setIsSubmitting(true);
    setStatus('Regal wird erstellt...');
    setMintedId('');

    try {
      const payload: Record<string, unknown> = {
        actor,
        type: 'shelf',
        location: selectedLocation,
        floor: selectedFloor
      };
      if (trimmedLabel) {
        payload.label = trimmedLabel;
      }
      if (trimmedNotes) {
        payload.notes = trimmedNotes;
      }
      logger.info('[shelf-create] Submitting shelf creation', {
        location: selectedLocation,
        floor: selectedFloor,
        hasLabel: Boolean(trimmedLabel),
        hasNotes: Boolean(trimmedNotes)
      });

      const response = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data: ShelfCreateResponse = await response.json().catch(() => ({}));

      if (response.ok && data.id) {
        setStatus('Regal erstellt.');
        setMintedId(data.id);
        console.info('[shelf-create] Shelf created', {
          id: data.id,
          location: selectedLocation,
          floor: selectedFloor,
          status: response.status
        });
        try {
          await dialogService.alert({
            title: 'Regal erstellt',
            message: `Regal-ID: ${data.id}`
          });
        } catch (error) {
          logError('Failed to display shelf success dialog', error, { shelfId: data.id });
        }
      } else {
        const errorMessage = data.error || `HTTP ${response.status}`;
        setStatus(`Fehler: ${errorMessage}`);
        setMintedId('');
        logger.warn('[shelf-create] Shelf creation failed', {
          status: response.status,
          error: data.error ?? data,
          location: selectedLocation,
          floor: selectedFloor,
        });
        try {
          await dialogService.alert({
            title: 'Regal-Erstellung fehlgeschlagen',
            message: `Fehler: ${errorMessage}`
          });
        } catch (error) {
          logError('Failed to display shelf error dialog', error, {
            location: selectedLocation,
            floor: selectedFloor,
            status: response.status
          });
        }
      }
    } catch (error) {
      logError('Shelf creation request failed', error, {
        location: selectedLocation,
        floor: selectedFloor,
      });
      setStatus('Regal-Erstellung fehlgeschlagen.');
      setMintedId('');
      try {
        await dialogService.alert({
          title: 'Regal-Erstellung fehlgeschlagen',
          message: 'Die Anfrage konnte nicht abgeschlossen werden.'
        });
      } catch (dialogError) {
        logError('Failed to display shelf request failure alert', dialogError, {
          location: selectedLocation,
          floor: selectedFloor,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (

    <div className='container'>
      <div className="card shelf-create-card">
        <h3>Regal erstellen</h3>
        <form onSubmit={handleSubmit}>
          <div className="row" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <label>
              Standort
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                required
                disabled={isSubmitting}
              >
                <option value="" disabled>
                  Standort wählen
                </option>
                {shelfLocations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ebene
              <select
                value={floor}
                onChange={(event) => setFloor(event.target.value)}
                required
                disabled={!location || floorOptions.length === 0 || isSubmitting}
              >
                <option value="" disabled>
                  Ebene wählen
                </option>
                {floorOptions.map((floorOption) => (
                  <option key={floorOption} value={floorOption}>
                    {floorOption}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Label/Notiz (optional)
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Regalname"
                disabled={isSubmitting}
              />
            </label>
            <label>
              Notizen (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Zusätzliche Hinweise"
                disabled={isSubmitting}
              />
            </label>
          </div>
          <div className="row">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Erstelle...' : 'Regal anlegen'}
            </button>
          </div>
          <div className="row">
            {status && <div>{status}</div>}
            {mintedId && (
              <div>
                Regal-ID: <Link to={`/boxes/${encodeURIComponent(mintedId)}`}>{mintedId}</Link>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
