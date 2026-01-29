import React, { useEffect, useMemo, useState } from 'react';
import { ensureUser } from '../lib/user';
import { formatShelfLabel } from '../lib/shelfLabel';
import { logger, logError } from '../utils/logger';
import { dialogService } from './dialog';

// TODO(agent): Extend relocation picker to support searching/filtering when location lists grow larger.
// TODO(agent): Confirm relocation flows fully rely on LocationId payloads once legacy Location fields are deprecated.
// TODO(agent): Consider sorting shelf options by parsed location/floor/shelf once labels are expanded.
// TODO(agent): Align relocation shelf loading logs with shared telemetry once analytics are centralized.
// TODO(agent): Validate relocation option labels against the LocationTag format once shelf labels are updated.

interface Props {
  boxId: string;
  onMoved?: () => void;
}

export default function RelocateBoxCard({ boxId, onMoved }: Props) {
  const LOCATION_BOX_TYPE = 'S';
  const [selectedLocation, setSelectedLocation] = useState('');
  const [status, setStatus] = useState('');
  const [locationOptions, setLocationOptions] = useState<Array<{ id: string; label: string; sourceBoxId: string }>>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  function buildShelfSelectionLabel(locationId: string, shelfLabel: string | null, fallbackLabel: string) {
    let parsedLabel = fallbackLabel;
    try {
      const segments = locationId
        .split('-')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments.length < 5 || segments[0] !== LOCATION_BOX_TYPE) {
        logger.warn('[relocate-box] Unexpected shelf id format for label', { locationId });
      } else {
        const shelfNumber = segments[4];
        const formattedBase = formatShelfLabel(locationId);
        if (formattedBase && shelfNumber) {
          parsedLabel = `${formattedBase} · Regal ${shelfNumber}`;
        } else if (formattedBase) {
          parsedLabel = formattedBase;
        } else {
          logger.warn('[relocate-box] Missing formatted shelf label for selection', { locationId });
        }
      }
    } catch (error) {
      logError('Failed to format relocation shelf label', error, { locationId, fallbackLabel });
    }

    let normalizedShelfLabel = '';
    try {
      normalizedShelfLabel = shelfLabel?.trim() ?? '';
    } catch (error) {
      logError('Failed to normalize relocation shelf label', error, { locationId, shelfLabel });
      normalizedShelfLabel = '';
    }

    if (normalizedShelfLabel && parsedLabel && normalizedShelfLabel !== parsedLabel) {
      return `${normalizedShelfLabel} · ${parsedLabel}`;
    }

    return normalizedShelfLabel || parsedLabel;
  }

  const locationLookup = useMemo(() => {
    return new Map(locationOptions.map((option) => [option.id, option]));
  }, [locationOptions]);

  useEffect(() => {
    let isMounted = true;

    async function loadLocations() {
      setIsLoadingLocations(true);
      const searchParams = new URLSearchParams();
      searchParams.set('type', LOCATION_BOX_TYPE);
      const requestUrl = `/api/boxes?${searchParams.toString()}`;
      let responseStatus: number | undefined;
      logger.info('[relocate-box] Loading shelf locations', { boxId, requestUrl });
      try {
        const response = await fetch(requestUrl);
        responseStatus = response.status;
        const data = await response.json().catch((parseError) => {
          logError('Standorte konnten nicht geladen werden (Parsing)', parseError, {
            boxId,
            status: responseStatus
          });
          return {} as {
            boxes?: Array<{
              BoxID?: string;
              Label?: string | null;
              LocationId?: string | null;
              ShelfLabel?: string | null;
            }>;
          };
        });

        if (!response.ok) {
          logger.error('[relocate-box] Standorte konnten nicht geladen werden', {
            status: responseStatus,
            boxId,
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
              const rawBoxLabel = typeof box?.Label === 'string' && box.Label.trim() ? box.Label.trim() : '';
              const rawShelfLabel =
                typeof box?.ShelfLabel === 'string' && box.ShelfLabel.trim() ? box.ShelfLabel.trim() : '';
              const shelfLabel = rawShelfLabel || rawBoxLabel || null;
              const fallbackLabel = shelfLabel || locationId;
              const label = buildShelfSelectionLabel(locationId, shelfLabel, fallbackLabel);
              return { id: locationId, label, sourceBoxId: fallbackId || locationId };
            })
            .filter((option): option is { id: string; label: string; sourceBoxId: string } => Boolean(option));
        } catch (error) {
          logError('Failed to filter relocation locations', error, {
            boxId,
            status: responseStatus
          });
          return;
        }

        if (isMounted) {
          setLocationOptions(nextOptions);
          logger.info('Loaded relocation locations', {
            count: nextOptions.length
          });
        }
      } catch (error) {
        logError('Standorte konnten nicht geladen werden', error, {
          boxId,
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
  }, [boxId]);

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
