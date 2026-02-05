import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ensureUser } from '../lib/user';
import { formatShelfLabel } from '../lib/shelfLabel';
import { logger, logError } from '../utils/logger';
import { dialogService } from './dialog';
import QrScanButton from './QrScanButton';

// TODO(agent): Extend relocation picker to support searching/filtering when location lists grow larger.
// TODO(agent): Confirm relocation flows fully rely on LocationId payloads once legacy Location fields are deprecated.
// TODO(agent): Consider sorting shelf options by parsed location/floor/shelf once labels are expanded.
// TODO(agent): Align relocation shelf loading logs with shared telemetry once analytics are centralized.
// TODO(agent): Validate relocation option labels against the LocationTag format once shelf labels are updated.
// TODO(qr-relocate): Confirm QR relocation scans map cleanly to shelf options during onsite validation.
// TODO(qr-relocate-intent): Consider extracting QR return intent guards into a shared helper if more cards consume qrReturn.
// TODO(relocate-layout): Reconfirm relocation input + QR alignment with updated search card patterns.

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
  const qrReturnHandledRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

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
  const locationLookupBySource = useMemo(() => {
    return new Map(locationOptions.map((option) => [option.sourceBoxId, option]));
  }, [locationOptions]);

  const submitRelocation = useCallback(
    async (locationOption: { id: string; label: string; sourceBoxId: string }, source: 'manual' | 'qr-return') => {
      const actor = await ensureUser();
      if (!actor) {
        logger.info('Relocate box aborted: missing username.', { source });
        try {
          await dialogService.alert({
            title: 'Aktion nicht möglich',
            message: 'Bitte zuerst oben den Benutzer setzen.'
          });
        } catch (error) {
          logError('Failed to display missing user alert for box relocation', error, { boxId, source });
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
          boxId,
          source
        });
      } catch (err) {
        logError('Relocate box failed', err, { boxId, source });
        setStatus('Verschieben fehlgeschlagen');
      }
    },
    [boxId, onMoved]
  );

  const handleQrReturnSelection = useCallback(
    (scannedId: string, rawPayload?: string, intent?: 'add-item' | 'relocate-box' | 'shelf-add-box') => {
      const trimmedId = scannedId.trim();
      if (!trimmedId) {
        logger.warn?.('RelocateBoxCard: ignoring empty QR return id', { boxId, scannedId });
        return;
      }
      const prefix = trimmedId.slice(0, 2).toUpperCase();
      logger.info?.('RelocateBoxCard: evaluating QR return payload', { boxId, scannedId: trimmedId, prefix, intent: intent ?? 'legacy-none' });
      if (prefix !== 'S-' && prefix !== 'B-') {
        logger.warn?.('RelocateBoxCard: ignoring QR return id without shelf/box prefix', { boxId, scannedId });
        return;
      }

      let locationOption: { id: string; label: string; sourceBoxId: string } | undefined;
      try {
        locationOption = locationLookup.get(trimmedId) ?? locationLookupBySource.get(trimmedId);
      } catch (error) {
        logError('RelocateBoxCard: failed to resolve QR relocation selection', error, { boxId, scannedId: trimmedId });
        return;
      }

      if (!locationOption) {
        logger.warn('RelocateBoxCard: scanned location not found in relocation options', { boxId, scannedId: trimmedId });
        return;
      }

      setSelectedLocation(locationOption.id);
      setStatus('Standort aus QR-Code übernommen');
      logger.info('RelocateBoxCard: QR return mapped to relocation option', {
        boxId,
        scannedId: trimmedId,
        locationId: locationOption.id,
        sourceBoxId: locationOption.sourceBoxId,
        rawPayload,
        intent: intent ?? 'legacy-none'
      });

      const shouldAutoSubmit = locationOptions.length === 1;
      if (shouldAutoSubmit) {
        void submitRelocation(locationOption, 'qr-return');
      }
    },
    [boxId, locationLookup, locationLookupBySource, locationOptions.length, submitRelocation]
  );

  useEffect(() => {
    if (!location.state || typeof location.state !== 'object') {
      return;
    }
    const state = location.state as { qrReturn?: { id?: unknown; rawPayload?: unknown; intent?: unknown } };
    if (!state.qrReturn) {
      return;
    }
    if (isLoadingLocations) {
      logger.info?.('RelocateBoxCard: deferring QR return handling until locations finish loading', { boxId });
      return;
    }
    try {
      const id = typeof state.qrReturn.id === 'string' ? state.qrReturn.id.trim() : '';
      if (!id) {
        logger.warn?.('RelocateBoxCard: ignoring QR return payload with empty id', { boxId, qrReturn: state.qrReturn });
        return;
      }
      if (qrReturnHandledRef.current === id) {
        return;
      }
      const rawPayload = typeof state.qrReturn.rawPayload === 'string' ? state.qrReturn.rawPayload : undefined;
      const rawIntent = typeof state.qrReturn.intent === 'string' ? state.qrReturn.intent.trim() : '';
      const intent = rawIntent === 'add-item' || rawIntent === 'relocate-box' || rawIntent === 'shelf-add-box'
        ? rawIntent
        : undefined;
      if (intent && intent !== 'relocate-box') {
        logger.info?.('RelocateBoxCard: ignoring QR return payload for non-relocate intent', { boxId, id, intent });
        try {
          navigate(location.pathname, { replace: true, state: {} });
        } catch (error) {
          logError('RelocateBoxCard: failed to clear QR return location state after intent mismatch', error, { boxId, id, intent });
        }
        return;
      }
      handleQrReturnSelection(id, rawPayload, intent);
      qrReturnHandledRef.current = id;
      try {
        navigate(location.pathname, { replace: true, state: {} });
      } catch (error) {
        logError('RelocateBoxCard: failed to clear QR return location state', error, { boxId, id });
      }
    } catch (error) {
      logError('RelocateBoxCard: failed to process QR return payload', error, { boxId });
    }
  }, [boxId, handleQrReturnSelection, isLoadingLocations, location.pathname, location.state, navigate]);

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
    await submitRelocation(locationOption, 'manual');
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
          <div className="row relocate-input-row">
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
            <QrScanButton
              className="secondary relocate-qr"
              label="Standort scannen"
              returnTo={location.pathname}
              scanIntent="relocate-box"
              onBeforeNavigate={() => setStatus('')}
            />
          </div>

          <div className="row relocate-submit-row">
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
