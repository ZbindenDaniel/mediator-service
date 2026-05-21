import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import RelocateItemCard from '../RelocateItemCard';
import EditInstanceCard from '../EditInstanceCard';
import QualityReviewModal from '../QualityReviewModal';
import QualityBadge from '../QualityBadge';
import PrintLabelButton from '../PrintLabelButton';
import QrScanButton from '../QrScanButton';
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
  instanceSpecRows: [string, React.ReactNode][];
  instanceRows: InstanceRow[];
  isBulkItem: boolean;
  isOutOfStock: boolean;
  skippedInstanceCount: number;
  showRelocate: boolean;
  relocateCardRef: React.RefObject<HTMLDivElement>;
  showEditInstance: boolean;
  showQualityReview: boolean;
  onAddItem: () => Promise<void>;
  onRemoveItem: () => Promise<void>;
  onRelocate: () => void;
  onEditInstance: () => void;
  onQualityReview: () => void;
  onInstanceNavigation: (itemId: string) => void;
  onRelocated: () => void;
  onInstanceSaved: () => void;
  onQualityReviewDone: () => void;
}

export default function ItemInstanceTab({
  item,
  instanceDetailRows,
  instanceSpecRows,
  instanceRows,
  isBulkItem,
  isOutOfStock,
  skippedInstanceCount,
  showRelocate,
  relocateCardRef,
  showEditInstance,
  showQualityReview,
  onAddItem,
  onRemoveItem,
  onRelocate,
  onEditInstance,
  onQualityReview,
  onInstanceNavigation,
  onRelocated,
  onInstanceSaved,
  onQualityReviewDone,
}: Props) {
  const [existingAnswers, setExistingAnswers] = useState<Record<string, string>>({});

  async function handleOpenQualityReview() {
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/quality-review`);
      if (res.ok) {
        const data = await res.json() as { responses?: Record<string, string> };
        setExistingAnswers(data.responses ?? {});
      }
    } catch {
      setExistingAnswers({});
    }
    onQualityReview();
  }

  async function handleEntnehmen() {
    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: isBulkItem ? 'Menge reduzieren?' : 'Entnehmen?',
        message: isBulkItem ? 'Menge um 1 reduzieren?' : 'Artikel entnehmen?',
        confirmLabel: isBulkItem ? 'Reduzieren' : 'Entnehmen',
        cancelLabel: 'Abbrechen'
      });
    } catch (error) {
      console.error('Failed to confirm Entnehmen', error);
      return;
    }
    if (!confirmed) return;
    await onRemoveItem();
  }

  return (
    <>
      <div className="tab-actions">
        <PrintLabelButton itemId={item.ItemUUID} inline />
        <button type="button" className="btn" onClick={onEditInstance}>Bearbeiten</button>
        <button type="button" className="btn" onClick={() => void handleOpenQualityReview()}>Neu bewerten</button>
        {!isOutOfStock && (
          <QrScanButton
            searchTarget={item.ItemUUID}
            searchLabel={item.Artikel_Nummer ?? item.ItemUUID}
            label="Finden"
          />
        )}
        {!isOutOfStock && (
          <button type="button" className="btn" onClick={onRelocate}>Umlagern</button>
        )}
        {!isOutOfStock && (
          <button type="button" className="btn" onClick={() => void handleEntnehmen()}>
            {isBulkItem ? 'Menge reduzieren' : 'Entnehmen'}
          </button>
        )}
        {isOutOfStock && (
          <button type="button" className="btn" onClick={() => void onAddItem()}>Hinzufügen</button>
        )}
        {isBulkItem && !isOutOfStock && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              let confirmed = false;
              try {
                confirmed = await dialogService.confirm({
                  title: 'Menge erhöhen?',
                  message: 'Menge um 1 erhöhen?',
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
        )}
      </div>

      {item.Quality === null && (
        <div className="quality-missing-hint">
          <span>Qualitätsbewertung fehlt</span>
          <button type="button" className="btn btn--small" onClick={() => void handleOpenQualityReview()}>
            Jetzt bewerten
          </button>
        </div>
      )}

      <div className="card">
        <h3>dieser Artikel</h3>
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
        {instanceSpecRows.length > 0 && (
          <>
            <h4 style={{ marginTop: '1rem', marginBottom: '0.25rem' }}>Spezifikationen</h4>
            <table className="details">
              <tbody>
                {instanceSpecRows.map(([k, v], idx) => {
                  const cell = normalizeDetailValue(v);
                  return (
                    <tr key={`spec-${k}-${idx}`} className="responsive-row">
                      <th className="responsive-th">{k}</th>
                      <td className={`responsive-td${cell.isPlaceholder ? ' is-placeholder' : ''}`}>
                        {cell.content}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        {isOutOfStock && <p className="muted">Instanz nicht mehr eingelagert.</p>}
      </div>

      {showRelocate && ReactDOM.createPortal(
        <div className="dialog-overlay" role="presentation" onClick={onRelocated}>
          <div
            className="dialog-content"
            role="dialog"
            aria-modal="true"
            aria-label="Artikel umlagern"
            onClick={(e) => e.stopPropagation()}
          >
            <RelocateItemCard
              itemId={item.ItemUUID}
              onRelocated={onRelocated}
            />
          </div>
        </div>,
        document.body
      )}

      {showEditInstance && ReactDOM.createPortal(
        <div className="dialog-overlay" role="presentation" onClick={onInstanceSaved}>
          <div
            className="dialog-content"
            role="dialog"
            aria-modal="true"
            aria-label="Instanz bearbeiten"
            onClick={(e) => e.stopPropagation()}
          >
            <EditInstanceCard
              itemId={item.ItemUUID}
              einheit={item.Einheit}
              currentSerialNumber={item.SerialNumber}
              currentMacAddress={item.MacAddress}
              onSaved={onInstanceSaved}
              onCancel={onInstanceSaved}
            />
          </div>
        </div>,
        document.body
      )}

      {showQualityReview && (
        <QualityReviewModal
          itemId={item.ItemUUID}
          subCategory={item.Unterkategorien_A}
          onDone={onQualityReviewDone}
          onCancel={onQualityReviewDone}
          initialAnswers={existingAnswers}
        />
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
