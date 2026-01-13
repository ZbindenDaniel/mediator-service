import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemCategories } from '../data/itemCategories';
import { shelfLocations } from '../data/shelfLocations';
import { ensureUser } from '../lib/user';
import { logError } from '../utils/logger';
import { dialogService } from './dialog';

// TODO(agent): Confirm shelf creation copy once warehouse naming conventions are finalized.

interface ShelfCreateResponse {
  ok?: boolean;
  id?: string;
  error?: string;
}

export default function ShelfCreateForm() {
  const [location, setLocation] = useState('');
  const [floor, setFloor] = useState('');
  const [category, setCategory] = useState('');
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

  const categoryOptions = useMemo(() => itemCategories.map((categoryOption) => categoryOption.label), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedLocation = location.trim();
    const selectedFloor = floor.trim();
    const selectedCategory = category.trim();

    if (!selectedLocation || !selectedFloor || !selectedCategory) {
      setStatus('Bitte alle Felder auswählen.');
      console.warn('[shelf-create] Missing selection before submit', {
        selectedLocation,
        selectedFloor,
        selectedCategory
      });
      return;
    }

    const actor = await ensureUser({
      title: 'Benutzername',
      message: 'Bitte geben Sie Ihren Benutzernamen für die Regal-Erstellung ein:'
    });

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
      const payload = {
        actor,
        type: 'shelf',
        location: selectedLocation,
        floor: selectedFloor,
        category: selectedCategory
      };

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
          category: selectedCategory,
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
        console.warn('[shelf-create] Shelf creation failed', {
          status: response.status,
          error: data.error ?? data,
          location: selectedLocation,
          floor: selectedFloor,
          category: selectedCategory
        });
      }
    } catch (error) {
      logError('Shelf creation request failed', error, {
        location: selectedLocation,
        floor: selectedFloor,
        category: selectedCategory
      });
      setStatus('Regal-Erstellung fehlgeschlagen.');
      setMintedId('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
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
            Kategorie
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
              disabled={isSubmitting}
            >
              <option value="" disabled>
                Kategorie wählen
              </option>
              {categoryOptions.map((categoryLabel) => (
                <option key={categoryLabel} value={categoryLabel}>
                  {categoryLabel}
                </option>
              ))}
            </select>
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
  );
}
