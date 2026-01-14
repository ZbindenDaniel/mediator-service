import React, { useEffect, useMemo, useState } from 'react';
import { ensureUser } from '../lib/user';
import { logger, logError } from '../utils/logger';
import { dialogService } from './dialog';

// TODO(agent): Extend relocation picker to support searching/filtering when location lists grow larger.
// TODO(agent): Confirm relocation flows fully rely on LocationId payloads once legacy Location fields are deprecated.
// TODO(agent): Validate relocation shelf filter behavior when boxes contain multiple categories.
// TODO(agent): Consider sorting shelf options by parsed location/floor/shelf once labels are expanded.

interface Props {
  boxId: string;
  categorySegment?: string | null;
  onMoved?: () => void;
}

export default function RelocateBoxCard({ boxId, categorySegment, onMoved }: Props) {
  const LOCATION_BOX_TYPE = 'S';
  const [selectedLocation, setSelectedLocation] = useState('');
  const [status, setStatus] = useState('');
  const [locationOptions, setLocationOptions] = useState<Array<{ id: string; label: string; sourceBoxId: string }>>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  function formatShelfLabel(locationId: string, fallbackLabel: string) {
    const segments = locationId
      .split('-')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length < 5 || segments[0] !== LOCATION_BOX_TYPE) {
      logger.warn('[relocate-box] Unexpected shelf id format for label', { locationId });
      return fallbackLabel;
    }
    const location = segments[1];
    const floor = segments[2];
    const shelfNumber = segments[4];
    if (!location || !floor || !shelfNumber) {
      logger.warn('[relocate-box] Missing shelf id segments for label', { locationId });
      return fallbackLabel;
    }
    return `Standort ${location} · Etage ${floor} · Regal ${shelfNumber}`;
  }

  const locationLookup = useMemo(() => {
    return new Map(locationOptions.map((option) => [option.id, option]));
  }, [locationOptions]);

  useEffect(() => {
    let isMounted = true;

    async function loadLocations() {
      setIsLoadingLocations(true);
      const normalizedCategory = categorySegment?.trim() ?? '';
      if (!normalizedCategory) {
        logger.warn('[relocate-box] Missing category filter for shelf lookup', { boxId });
      }
      const searchParams = new URLSearchParams();
      searchParams.set('type', LOCATION_BOX_TYPE);
      if (normalizedCategory) {
        searchParams.set('category', normalizedCategory);
      }
      const requestUrl = `/api/boxes?${searchParams.toString()}`;
      let responseStatus: number | undefined;
      try {
        const response = await fetch(requestUrl);
        responseStatus = response.status;
        const data = await response.json().catch((parseError) => {
          logError('Standorte konnten nicht geladen werden (Parsing)', parseError, {
            boxId,
            category: normalizedCategory || null,
            status: responseStatus
          });
          return {} as { boxes?: Array<{ BoxID?: string; Label?: string | null; LocationId?: string | null }> };
        });

        if (!response.ok) {
          logger.error('[relocate-box] Standorte konnten nicht geladen werden', {
            status: responseStatus,
            boxId,
            category: normalizedCategory || null,
            payload: data
          });
          return;
        }

        const boxes = Array.isArray(data.boxes) ? data.boxes : [];
        let nextOptions: Array<{ id: string; label: string; sourceBoxId: string }> = [];
        try {
          nextOptions = boxes
            .map((box) => {
              const fallbackId = typeof box?.BoxID === 'string' ? box.BoxID.trim() : '';
              const locationId =
                typeof box?.LocationId === 'string' && box.LocationId.trim() ? box.LocationId.trim() : fallbackId;
              if (!locationId) {
                return null;
              }
              const fallbackLabel = typeof box?.Label === 'string' && box.Label.trim() ? box.Label.trim() : locationId;
              const label = formatShelfLabel(locationId, fallbackLabel);
              return { id: locationId, label, sourceBoxId: fallbackId || locationId };
            })
            .filter((option): option is { id: string; label: string; sourceBoxId: string } => Boolean(option));
        } catch (error) {
          logError('Failed to filter relocation locations', error, {
            boxId,
            category: normalizedCategory || null,
            status: responseStatus
          });
          return;
        }

        if (isMounted) {
          setLocationOptions(nextOptions);
          logger.info('Loaded relocation locations', {
            count: nextOptions.length,
            category: normalizedCategory || null
          });
          if (normalizedCategory && nextOptions.length === 0) {
            logger.warn('[relocate-box] No shelf locations returned for category filter', {
              boxId,
              category: normalizedCategory,
              status: responseStatus
            });
          }
        }
      } catch (error) {
        logError('Standorte konnten nicht geladen werden', error, {
          boxId,
          category: normalizedCategory || null,
          status: responseStatus
        });
      } finally {
        if (isMounted) {
          setIsLoadingLocations(false);
        }
      }
    }

    loadLocations();

    return () => {
      isMounted = false;
    };
  }, [boxId, categorySegment]);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const locationId = selectedLocation.trim();
    const locationOption = locationLookup.get(locationId);

    if (!locationOption) {
      logger.warn('Invalid location selection for relocation', { boxId, locationId });
      setStatus('Bitte einen Standort wählen');
      return;
    }

    const actor = await ensureUser();
    if (!actor) {
      logger.info('Relocate box aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        logError('Failed to display missing user alert for box relocation', error, { boxId });
      }
      return;
    }

    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ LocationId: locationOption.id, actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Behälter verschoben');
        onMoved?.();
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      logger.info('relocate box', {
        status: res.status,
        locationId: locationOption.id,
        sourceBoxId: locationOption.sourceBoxId,
        boxId
      });
    } catch (err) {
      logError('Relocate box failed', err, { boxId });
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Behälter umlagern</h3>
      <form onSubmit={handle}>
        <div className=''>
          <div className='row'>
            <label>
              Neuer Ort
            </label>
          </div>
          <div className='row' style={{ gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              required
              disabled={isLoadingLocations}
            >
              <option value="" disabled>
                {isLoadingLocations ? 'Lade Standorte...' : 'Standort wählen'}
              </option>
              {locationOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
           </div>

          <div className='row'>
            <button type="submit">Verschieben</button>
          </div>

          <div className='row'>
            {status && <div>{status}</div>}
          </div>
        </div>
      </form>
    </div>
  );
}
