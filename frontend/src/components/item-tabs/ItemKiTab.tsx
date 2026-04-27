import React from 'react';
import { AgenticStatusCard, type AgenticStatusCardProps } from '../AgenticStatusCard';
import AgenticSpecFieldReviewModal, {
  type AgenticSpecFieldOption,
  type AgenticSpecFieldReviewResult
} from '../AgenticSpecFieldReviewModal';

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
  agenticCardProps: AgenticStatusCardProps;
  specFieldModalState: SpecFieldModalState | null;
  onSpecFieldModalClose: () => void;
  onSpecFieldModalConfirm: (result: AgenticSpecFieldReviewResult) => void;
  canClose: boolean;
  onClose?: () => void | Promise<void>;
  canDelete: boolean;
  onDelete?: () => void | Promise<void>;
  actionPending: boolean;
}

export default function ItemKiTab({
  agenticCardProps,
  specFieldModalState,
  onSpecFieldModalClose,
  onSpecFieldModalConfirm,
  canClose,
  onClose,
  canDelete,
  onDelete,
  actionPending
}: Props) {
  return (
    <>
      {(canClose || canDelete) && (
        <div className="tab-actions">
          {canClose && onClose && (
            <button type="button" className="btn" disabled={actionPending} onClick={() => void onClose()}>
              Abschliessen
            </button>
          )}
          {canDelete && onDelete && (
            <button type="button" className="btn btn--danger" disabled={actionPending} onClick={() => void onDelete()}>
              Löschen
            </button>
          )}
        </div>
      )}
      <AgenticStatusCard {...agenticCardProps} noCollapse />
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
