import React from 'react';
import RelocateItemCard from '../RelocateItemCard';
import QualityBadge from '../QualityBadge';
import { dialogService } from '../dialog';
import { normalizeDetailValue } from '../../lib/itemDetailFormatting';
import type { Item } from '../../../../models';

export interface InstanceRow {
  id: string;
  qualityValue: number | null;
  boxId: React.ReactNode;
  location: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

interface Props {
  item: Item;
  instanceDetailRows: [string, React.ReactNode][];
  instanceRows: InstanceRow[];
  isBulkItem: boolean;
  isOutOfStock: boolean;
  skippedInstanceCount: number;
  showRelocate: boolean;
  relocateCardRef: React.RefObject<HTMLDivElement>;
  onAddItem: () => Promise<void>;
  onRemoveItem: () => Promise<void>;
  onInstanceNavigation: (itemId: string) => void;
  onRelocated: () => void;
}

export default function ItemInstanceTab({
  item,
  instanceDetailRows,
  instanceRows,
  isBulkItem,
  isOutOfStock,
  skippedInstanceCount,
  showRelocate,
  relocateCardRef,
  onAddItem,
  onRemoveItem,
  onInstanceNavigation,
  onRelocated
}: Props) {
  return (
    <>
      <div className="card">
        <h3>dieser Artikel</h3>
        <div className="row">
          {instanceDetailRows.length > 0 ? (
            <table className="details">
              <tbody>
                {instanceDetailRows.map(([k, v], idx) => {
                  const cell = normalizeDetailValue(v);
                  return (
                    <tr key={`${k}-${idx}`} className="responsive-row">
                      <th className="responsive-th">{k}</th>
                      <td className={`responsive-td${cell.isPlaceholder ? ' is-placeholder' : ''}`}>
                        {cell.content}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="muted">Keine Instanzdaten vorhanden.</p>
          )}
          {isOutOfStock ? (
            <>
              <p className="muted">Instanz nicht mehr eingelagert.</p>
              <button type="button" className="btn" onClick={() => void onAddItem()}>
                Hinzufügen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                let confirmed = false;
                try {
                  confirmed = await dialogService.confirm({
                    title: isBulkItem ? 'Menge reduzieren?' : 'Artikel auslagern?',
                    message: isBulkItem ? 'Menge hinzufügen?' : 'Artikel auslagern?',
                    confirmLabel: isBulkItem ? 'Reduzieren' : 'Auslagern',
                    cancelLabel: 'Abbrechen'
                  });
                } catch (error) {
                  console.error('Failed to confirm item removal', error);
                  return;
                }
                if (!confirmed) return;
                await onRemoveItem();
              }}
            >
              {isBulkItem ? 'Menge reduzieren' : 'Auslagern'}
            </button>
          )}
          {isBulkItem && !isOutOfStock ? (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                let confirmed = false;
                try {
                  confirmed = await dialogService.confirm({
                    title: 'Menge erhöhen?',
                    message: 'Menge hinzufügen?',
                    confirmLabel: 'Hinzufügen',
                    cancelLabel: 'Abbrechen'
                  });
                } catch (error) {
                  console.error('Failed to confirm bulk add', error);
                  return;
                }
                if (!confirmed) return;
                await onAddItem();
              }}
            >
              Hinzufügen
            </button>
          ) : null}
        </div>
      </div>

      {showRelocate && (
        <div ref={relocateCardRef}>
          <RelocateItemCard
            itemId={item.ItemUUID}
            onRelocated={() => {
              onRelocated();
              relocateCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>
      )}

      <div className="card grid-span-2">
        <h3>Vorrat</h3>
        {instanceRows.length > 0 ? (
          <>
            <div className="item-detail__stock-table">
              <table className="details">
                <thead>
                  <tr>
                    <th>UUID</th>
                    <th>Qualität</th>
                    <th>Behälter</th>
                    <th>Standort</th>
                    <th>Aktualisiert</th>
                    <th>Erfasst</th>
                  </tr>
                </thead>
                <tbody>
                  {instanceRows.map((row) => {
                    const isQualityPlaceholder = row.qualityValue === null;
                    const isCurrentInstance = row.id === item.ItemUUID;
                    const uuidCell = normalizeDetailValue(row.id);
                    const boxCell = normalizeDetailValue(row.boxId);
                    const locationCell = normalizeDetailValue(row.location);
                    const updatedCell = normalizeDetailValue(row.updatedAt);
                    const createdCell = normalizeDetailValue(row.createdAt);
                    const navigationLabel = `Instanz ${row.id} öffnen`;
                    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onInstanceNavigation(row.id);
                      }
                    };
                    return (
                      <tr
                        key={row.id}
                        className={isCurrentInstance ? 'is-current-instance' : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => onInstanceNavigation(row.id)}
                        onKeyDown={handleRowKeyDown}
                        aria-label={navigationLabel}
                      >
                        <td className={uuidCell.isPlaceholder ? 'is-placeholder' : undefined}>{uuidCell.content}</td>
                        <td className={isQualityPlaceholder ? 'is-placeholder' : undefined}>
                          <QualityBadge compact value={row.qualityValue} labelPrefix="Qualität" />
                        </td>
                        <td className={boxCell.isPlaceholder ? 'is-placeholder' : undefined}>{boxCell.content}</td>
                        <td className={locationCell.isPlaceholder ? 'is-placeholder' : undefined}>{locationCell.content}</td>
                        <td className={updatedCell.isPlaceholder ? 'is-placeholder' : undefined}>{updatedCell.content}</td>
                        <td className={createdCell.isPlaceholder ? 'is-placeholder' : undefined}>{createdCell.content}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {skippedInstanceCount > 0 && (
              <p className="muted">{skippedInstanceCount} Instanz(en) ohne Lagerbestand ausgeblendet.</p>
            )}
          </>
        ) : (
          <p className="muted">Keine Instanzen vorhanden.</p>
        )}
      </div>
    </>
  );
}
