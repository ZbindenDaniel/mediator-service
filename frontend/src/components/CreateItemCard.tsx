import React from 'react';
import ItemCreate from './ItemCreate';

/** Card describing item creation */
// TODO(overview-inline-create): Confirm the overview create item card matches navigation expectations.
export default function CreateItemCard() {
  return (
    <ItemCreate
      layout="embedded"
      basicInfoHeader={(
        <>
          <h2>Erfassen</h2>
          <p className="muted">Neuen Artikel erfassen und später platzieren</p>
        </>
      )}
    />
  );
}
