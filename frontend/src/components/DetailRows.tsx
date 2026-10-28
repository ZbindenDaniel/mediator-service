import React, { useState } from 'react';
import { normalizeDetailValue } from '../lib/itemDetailFormatting';

interface Props {
  rows: Array<[string, React.ReactNode]>;
  keyPrefix?: string;
}

// Shared key/value list for the detail tabs (was the same <table> loop in four places).
// Empty fields fold behind a toggle: they cost a full row each and mostly say "not captured".
export default function DetailRows({ rows, keyPrefix = '' }: Props) {
  const [showEmpty, setShowEmpty] = useState(false);
  const cells = rows.map(([label, value]) => ({ label, cell: normalizeDetailValue(value) }));
  const emptyCount = cells.filter(({ cell }) => cell.isPlaceholder).length;
  const visible = showEmpty ? cells : cells.filter(({ cell }) => !cell.isPlaceholder);

  return (
    <>
      {visible.length > 0 && (
        <table className="details details--kv">
          <tbody>
            {visible.map(({ label, cell }, idx) => (
              <tr key={`${keyPrefix}${label}-${idx}`} className={cell.isPlaceholder ? 'is-empty' : undefined}>
                <th>{label}</th>
                <td className={cell.isPlaceholder ? 'is-placeholder' : undefined}>{cell.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {emptyCount > 0 && (
        <button type="button" className="link-btn details-kv__toggle" onClick={() => setShowEmpty((v) => !v)}>
          {showEmpty ? 'Leere Felder ausblenden' : `${emptyCount} leere Felder anzeigen`}
        </button>
      )}
    </>
  );
}
