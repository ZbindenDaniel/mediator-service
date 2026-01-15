import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemCategories } from '../data/itemCategories';
import { shelfLocations } from '../data/shelfLocations';
import { ensureUser } from '../lib/user';
import { logger, logError } from '../utils/logger';
import { dialogService } from './dialog';

// TODO(agent): Confirm shelf creation copy once warehouse naming conventions are finalized.
// TODO(agent): Consolidate shelf category selectors with the item filter UI when shared controls are available.

interface ShelfCreateResponse {
  ok?: boolean;
  id?: string;
  error?: string;
}

export default function ShelfCreateForm() {
  const [location, setLocation] = useState('');
  const [floor, setFloor] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
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

  const categoryOptions = useMemo(
    () =>
      itemCategories.map((categoryOption) => ({
        code: String(categoryOption.code),
        label: categoryOption.label
      })),
    []
  );
  const activeCategory = useMemo(
    () => itemCategories.find((categoryOption) => String(categoryOption.code) === category),
    [category]
  );
  const subcategoryOptions = useMemo(
    () =>
      activeCategory?.subcategories.map((subcategoryOption) => ({
        code: String(subcategoryOption.code),
        label: subcategoryOption.label
      })) ?? [],
    [activeCategory]
  );

  useEffect(() => {
    if (!category) {
      setSubcategory('');
      return;
    }

    if (subcategoryOptions.length === 0) {
      setSubcategory('');
      return;
    }

    if (!subcategoryOptions.some((option) => option.code === subcategory)) {
      setSubcategory(subcategoryOptions[0].code);
    }
  }, [category, subcategory, subcategoryOptions]);

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

  useEffect(() => {
    if (!category) {
      return;
    }

    if (!categoryOptions.some((option) => option.code === category)) {
      logger.warn('[shelf-create] Invalid category selection', {
        category,
        availableCategories: categoryOptions.map((option) => option.code)
      });
    }
  }, [category, categoryOptions]);

  useEffect(() => {
    if (!subcategory) {
      return;
    }

    if (!subcategoryOptions.some((option) => option.code === subcategory)) {
      logger.warn('[shelf-create] Invalid subcategory selection', {
        category,
        subcategory,
        availableSubcategories: subcategoryOptions.map((option) => option.code)
      });
    }
  }, [category, subcategory, subcategoryOptions]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedLocation = location.trim();
    const selectedFloor = floor.trim();
    const selectedCategory = category.trim();
    const selectedSubcategory = subcategory.trim();

    if (!selectedLocation || !selectedFloor || !selectedCategory || !selectedSubcategory) {
      setStatus('Bitte alle Felder auswählen.');
      logger.warn('[shelf-create] Missing selection before submit', {
        selectedLocation,
        selectedFloor,
        selectedCategory,
        selectedSubcategory
      });
      try {
        await dialogService.alert({
          title: 'Eingaben fehlen',
          message: 'Bitte Standort, Ebene, Kategorie und Unterkategorie auswählen.'
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

    if (!categoryOptions.some((option) => option.code === selectedCategory)) {
      setStatus('Ungültige Kategorie ausgewählt.');
      logger.warn('[shelf-create] Invalid category before submit', {
        selectedCategory
      });
      try {
        await dialogService.alert({
          title: 'Ungültige Kategorie',
          message: 'Bitte eine gültige Kategorie auswählen.'
        });
      } catch (error) {
        logError('Failed to display invalid category alert for shelf creation', error, {
          selectedCategory
        });
      }
      return;
    }

    if (!subcategoryOptions.some((option) => option.code === selectedSubcategory)) {
      setStatus('Ungültige Unterkategorie ausgewählt.');
      logger.warn('[shelf-create] Invalid subcategory before submit', {
        selectedCategory,
        selectedSubcategory
      });
      try {
        await dialogService.alert({
          title: 'Ungültige Unterkategorie',
          message: 'Bitte eine gültige Unterkategorie auswählen.'
        });
      } catch (error) {
        logError('Failed to display invalid subcategory alert for shelf creation', error, {
          selectedCategory,
          selectedSubcategory
        });
      }
      return;
    }

    const selectedSubcategoryCode = Number.parseInt(selectedSubcategory, 10);
    if (!Number.isFinite(selectedSubcategoryCode)) {
      setStatus('Ungültige Unterkategorie ausgewählt.');
      logger.warn('[shelf-create] Non-numeric subcategory code selected', {
        selectedCategory,
        selectedSubcategory
      });
      try {
        await dialogService.alert({
          title: 'Ungültige Unterkategorie',
          message: 'Bitte eine gültige Unterkategorie auswählen.'
        });
      } catch (error) {
        logError('Failed to display invalid subcategory alert for shelf creation', error, {
          selectedCategory,
          selectedSubcategory
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
        selectedCategory,
        selectedSubcategory
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
      const payload = {
        actor,
        type: 'shelf',
        location: selectedLocation,
        floor: selectedFloor,
        category: selectedSubcategoryCode
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
          subcategory: selectedSubcategory,
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
          category: selectedCategory,
          subcategory: selectedSubcategory
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
            category: selectedCategory,
            status: response.status
          });
        }
      }
    } catch (error) {
      logError('Shelf creation request failed', error, {
        location: selectedLocation,
        floor: selectedFloor,
        category: selectedCategory,
        subcategory: selectedSubcategory
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
          category: selectedCategory,
          subcategory: selectedSubcategory
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
                {categoryOptions.map((categoryOption) => (
                  <option key={categoryOption.code} value={categoryOption.code}>
                    {categoryOption.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unterkategorie
              <select
                value={subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
                required
                disabled={!category || subcategoryOptions.length === 0 || isSubmitting}
              >
                <option value="" disabled>
                  Unterkategorie wählen
                </option>
                {subcategoryOptions.map((subcategoryOption) => (
                  <option key={subcategoryOption.code} value={subcategoryOption.code}>
                    {subcategoryOption.label}
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
    </div>
  );
}
