import React from 'react';
import { AgenticStatusCard, type AgenticStatusCardProps } from '../AgenticStatusCard';
import AgenticSpecFieldReviewModal, {
  type AgenticSpecFieldOption,
  type AgenticSpecFieldReviewResult
} from '../AgenticSpecFieldReviewModal';
import ShopBadge from '../ShopBadge';
import ZubehoerBadge from '../ZubehoerBadge';
import { normalizeDetailValue } from '../../lib/itemDetailFormatting';
import type { Item } from '../../../../models';

export interface SpecFieldModalState {
  title: string;
  description: string;
  fieldOptions: AgenticSpecFieldOption[];
  includeAdditionalInput: boolean;
  additionalInputPlaceholder?: string;
  secondaryTitle?: string;
  secondaryDescription?: string;
  secondaryFieldOptions?: AgenticSpecFieldOption[];
  includeSecondaryAdditionalInput?: boolean;
  secondaryAdditionalInputPlaceholder?: string;
}

interface Props {
  item: Item;
  referenceDetailRows: [string, React.ReactNode][];
  neighborIds: { previousId: string | null; nextId: string | null };
  neighborsLoading: boolean;
  connectedToDevices: any[];
  compatibleParentRefs: any[];
  agenticCardProps: AgenticStatusCardProps;
  specFieldModalState: SpecFieldModalState | null;
  onSpecFieldModalClose: () => void;
  onSpecFieldModalConfirm: (result: AgenticSpecFieldReviewResult) => void;
  onNeighborNav: (direction: 'previous' | 'next') => void;
  onEdit: () => void;
}

export default function ItemReferenceTab({
  item,
  referenceDetailRows,
  neighborIds,
  neighborsLoading,
  connectedToDevices,
  compatibleParentRefs,
  agenticCardProps,
  specFieldModalState,
  onSpecFieldModalClose,
  onSpecFieldModalConfirm,
  onNeighborNav
}: Props) {
  return (
    <>
      <div className="card grid-span-row-2">
        <div className='top-row'>
          <button
            type="button"
            className="sml-btn btn"
            disabled={!neighborIds.previousId || neighborsLoading}
            onClick={() => onNeighborNav('previous')}
            aria-label="Vorheriger Artikel"
          >
            ←
          </button>
          <button
            type="button"
            className="sml-btn btn"
            disabled={!neighborIds.nextId || neighborsLoading}
            onClick={() => onNeighborNav('next')}
            aria-label="Nächster Artikel"
          >
            →
          </button>
        </div>

        <h2 className="item-detail__title">
          Artikel <span className="muted">({item.ItemUUID})</span>
          <span style={{ marginLeft: '8px' }}>
            <ShopBadge
              compact
              labelPrefix="Shop/Veröffentlichung"
              shopartikel={item.Shopartikel ?? null}
              publishedStatus={item.Veröffentlicht_Status ?? null}
            />
          </span>
          <span style={{ marginLeft: '4px' }}>
            <ZubehoerBadge
              compact
              mode={
                connectedToDevices.length > 0
                  ? 'connected'
                  : compatibleParentRefs.length > 0
                    ? 'available'
                    : null
              }
            />
          </span>
        </h2>
        <h3>Referenz</h3>
        {referenceDetailRows.length > 0 ? (
          <table className="details">
            <tbody>
              {referenceDetailRows.map(([k, v], idx) => {
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
          <p className="muted">Keine Referenzdaten vorhanden.</p>
        )}
      </div>

      <AgenticStatusCard {...agenticCardProps} />

      {specFieldModalState ? (
        <AgenticSpecFieldReviewModal
          title={specFieldModalState.title}
          description={specFieldModalState.description}
          fieldOptions={specFieldModalState.fieldOptions}
          includeAdditionalInput={specFieldModalState.includeAdditionalInput}
          additionalInputPlaceholder={specFieldModalState.additionalInputPlaceholder}
          secondaryTitle={specFieldModalState.secondaryTitle}
          secondaryDescription={specFieldModalState.secondaryDescription}
          secondaryFieldOptions={specFieldModalState.secondaryFieldOptions}
          includeSecondaryAdditionalInput={specFieldModalState.includeSecondaryAdditionalInput}
          secondaryAdditionalInputPlaceholder={specFieldModalState.secondaryAdditionalInputPlaceholder}
          onCancel={onSpecFieldModalClose}
          onConfirm={onSpecFieldModalConfirm}
        />
      ) : null}
    </>
  );
}
