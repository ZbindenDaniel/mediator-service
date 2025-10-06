import React, { useEffect, useState } from 'react';
import { ensureUser } from '../lib/user';
import { dialogService } from './dialog';
import { Link } from 'react-router-dom';
import { GoLinkExternal } from 'react-icons/go';

interface Props {
  itemId: string;
  onRelocated?: () => void | Promise<void>;
}

export default function RelocateItemCard({ itemId, onRelocated }: Props) {
  const [boxId, setBoxId] = useState('');
  const [suggestions, setSuggestions] = useState<{ BoxID: string; Location: string }[]>([]);
  const [status, setStatus] = useState('');
  const [boxLink, setBoxLink] = useState('');

  useEffect(() => {
    const v = boxId.trim();
    if (v.length < 2) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    async function search() {
      try {
        const r = await fetch('/api/search?term=' + encodeURIComponent(v), { signal: ctrl.signal });
        const data = await r.json().catch(() => ({}));
        setSuggestions(data.boxes || []);
      } catch (err) {
        if ((err as any).name !== 'AbortError') console.error('box search failed', err);
      }
    }
    search();
    return () => ctrl.abort();
  }, [boxId]);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
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
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Artikel verschoben');
        setBoxLink(`/boxes/${encodeURIComponent(boxId)}`)
        console.info('Relocate item succeeded', {
          itemId,
          toBoxId: boxId,
          status: res.status,
          response: data
        });
        if (typeof onRelocated === 'function') {
          try {
            await onRelocated();
            console.info('Relocate item onRelocated callback completed', { itemId, toBoxId: boxId });
          } catch (callbackErr) {
            console.error('Relocate item onRelocated callback failed', {
              itemId,
              toBoxId: boxId,
              error: callbackErr
            });
          }
        }
      } else {
        const errorMessage = 'Fehler: ' + (data.error || res.status);
        setStatus(errorMessage);
        console.warn('Relocate item failed', {
          itemId,
          toBoxId: boxId,
          status: res.status,
          error: data.error ?? data
        });
      }
    } catch (err) {
      console.error('Relocate item request failed', { itemId, toBoxId: boxId, error: err });
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  async function handleCreateBox() {
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
      const res = await fetch(`/api/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        setBoxId(data.id);
        setStatus('Behälter erstellt. Bitte platzieren!');
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('create box', res.status, data.id);
    } catch (err) {
      console.error('Create box failed', err);
      setStatus('Behälter anlegen fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Artikel umlagern</h3>
      <form onSubmit={handle}>
        <div className=''>
          <div className='row'>
            <label>
              Ziel Behälter-ID
            </label>
          </div>

          <div className='row'>
            <input list="box-suggest" value={boxId} onChange={e => setBoxId(e.target.value)} required />
          </div>

          <div className='row'>
            <datalist id="box-suggest">
              {suggestions.map(b => (
                <option key={b.BoxID} value={b.BoxID}>{b.Location}</option>
              ))}
            </datalist>
          </div>

          <div className='row'>
            <button type="submit">Verschieben</button>
            <button type="button" onClick={handleCreateBox}>Behälter anlegen</button>
          </div>

          <div className='row'>
            {status && <div>
              <span>
                {status}   
              </span>
              <span>
                {boxLink && <Link to={boxLink}><GoLinkExternal/></Link>}
              </span>
            </div>}
          </div>
          <div className='row'>
          </div>
        </div>
      </form>
    </div>
  );
}
