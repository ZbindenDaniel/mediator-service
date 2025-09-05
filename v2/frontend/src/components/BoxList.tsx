import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models';

export default function BoxList() {
  const [boxes, setBoxes] = useState<Box[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/boxes');
        if (res.ok) {
          const data = await res.json();
          setBoxes(data);
        } else {
          console.error('Failed to fetch boxes', res.status);
        }
      } catch (err) {
        console.error('Failed to fetch boxes', err);
      }
    }
    load();
  }, []);

  return (
    <div className="box-list">
      <h2>Boxes</h2>
      <ul>
        {boxes.map((b) => (
          <li key={b.BoxID}>
            <Link to={`/boxes/${encodeURIComponent(b.BoxID)}`}>{b.BoxID}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
