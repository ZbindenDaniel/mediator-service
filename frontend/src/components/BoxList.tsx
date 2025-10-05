import React from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models/box';
import BoxColorTag from './BoxColorTag';
import { formatDate } from '../lib/format';
import { GoLinkExternal } from 'react-icons/go';

interface Props {
  boxes: Box[];
}

export default function BoxList({ boxes }: Props) {
  console.log('[BoxList] rendering boxes', { count: boxes.length });

  return (
    <div className="box-list-wrapper">
      <table className="box-list">
        <thead>
          <tr className="box-list-header">
            <th className="col-box-id">Box</th>
            <th className="col-location">Standort</th>
            <th className="col-updated">Aktualisiert</th>
            <th className="col-link"></th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => {
            try {
              return (
                <tr key={box.BoxID} data-box-id={box.BoxID} className="box-list-row">
                  <td className="col-box-id">{box.BoxID}</td>
                  <td className="col-location">
                    <BoxColorTag locationKey={box.Location} />
                  </td>
                  <td className="col-updated">{box.UpdatedAt ? formatDate(box.UpdatedAt) : ''}</td>
                  <td className="col-link">
                    <Link to={`/boxes/${encodeURIComponent(box.BoxID)}`}><GoLinkExternal /></Link>
                  </td>
                </tr>
              );
            } catch (err) {
              console.error('Failed to render box row', { box, err });
              return null;
            }
          })}
        </tbody>
      </table>
    </div>
  );
}
