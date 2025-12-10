import React, { useEffect, useMemo, useState } from 'react';
import { ensureUser } from '../lib/user';
import { dialogService } from './dialog';

// TODO(agent): Extend relocation picker to support searching/filtering when location lists grow larger.
// TODO(agent): Confirm relocation flows fully rely on LocationId payloads once legacy Location fields are deprecated.

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

  const locationLookup = useMemo(() => {
    return new Map(locationOptions.map((option) => [option.id, option]));
  }, [locationOptions]);

  useEffect(() => {
    let isMounted = true;

    async function loadLocations() {
      setIsLoadingLocations(true);
      try {
        const response = await fetch(`/api/boxes?type=${encodeURIComponent(LOCATION_BOX_TYPE)}`);
        const data = await response.json().catch((parseError) => {
          console.error('Standorte konnten nicht geladen werden (Parsing)', parseError);
          return {} as { boxes?: Array<{ BoxID?: string; Label?: string | null; LocationId?: string | null }> };
        });

        if (!response.ok) {
          console.error('Standorte konnten nicht geladen werden', { status: response.status, payload: data });
          return;
        }

        const boxes = Array.isArray(data.boxes) ? data.boxes : [];
        const nextOptions = boxes
          .map((box) => {
            const fallbackId = typeof box?.BoxID === 'string' ? box.BoxID.trim() : '';
            const locationId = typeof box?.LocationId === 'string' && box.LocationId.trim() ? box.LocationId.trim() : fallbackId;
            if (!locationId) {
              return null;
            }
            const label = typeof box?.Label === 'string' && box.Label.trim() ? box.Label.trim() : locationId;
            return { id: locationId, label, sourceBoxId: fallbackId || locationId };
          })
          .filter((option): option is { id: string; label: string; sourceBoxId: string } => Boolean(option));

        if (isMounted) {
          setLocationOptions(nextOptions);
          console.info('Loaded relocation locations', { count: nextOptions.length });
        }
      } catch (error) {
        console.error('Standorte konnten nicht geladen werden', error);
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
  }, []);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const locationId = selectedLocation.trim();
    const locationOption = locationLookup.get(locationId);

    if (!locationOption) {
      console.warn('Invalid location selection for relocation', { boxId, locationId });
      setStatus('Bitte einen Standort wählen');
      return;
    }

    const actor = await ensureUser();
    if (!actor) {
      console.info('Relocate box aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for box relocation', error);
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
      console.log('relocate box', { status: res.status, locationId: locationOption.id, sourceBoxId: locationOption.sourceBoxId });
    } catch (err) {
      console.error('Relocate box failed', err);
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
