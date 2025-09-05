import React, { useState } from 'react';

export default function RelocateCard() {
  const [itemUuid, setItemUuid] = useState('');
  const [toBox, setToBox] = useState('');
  const [boxId, setBoxId] = useState('');
  const [location, setLocation] = useState('');
  const [actor, setActor] = useState('');

  async function moveItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemUuid)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: toBox, actor })
      });
      console.log('move item', res.status);
    } catch (err) {
      console.error('move item failed', err);
    }
  }

  async function moveBox(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, actor })
      });
      console.log('move box', res.status);
    } catch (err) {
      console.error('move box failed', err);
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Umlagern</h3>
      <form onSubmit={moveItem}>
        <label>
          Item UUID
          <input value={itemUuid} onChange={(e) => setItemUuid(e.target.value)} required />
        </label>
        <label>
          Ziel BoxID
          <input value={toBox} onChange={(e) => setToBox(e.target.value)} required />
        </label>
        <label>
          Nutzer
          <input value={actor} onChange={(e) => setActor(e.target.value)} required />
        </label>
        <button type="submit">Item verschieben</button>
      </form>
      <hr />
      <form onSubmit={moveBox}>
        <label>
          BoxID
          <input value={boxId} onChange={(e) => setBoxId(e.target.value)} required />
        </label>
        <label>
          Neuer Ort
          <input value={location} onChange={(e) => setLocation(e.target.value)} required />
        </label>
        <label>
          Nutzer
          <input value={actor} onChange={(e) => setActor(e.target.value)} required />
        </label>
        <button type="submit">Box verschieben</button>
      </form>
    </div>
  );
}

