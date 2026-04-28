import React from 'react';
import ReactDOM from 'react-dom';
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
  const { canStart, canRestart, canCancel, needsReview, reviewIntent, startLabel, onStart, onRestart, onCancel, onReview } = agenticCardProps;
  const startHandler = onStart ?? onRestart;
  const startText = typeof startLabel === 'string' && startLabel.trim() ? startLabel : 'Starten';

  const hasActions = canStart || canRestart || canCancel || needsReview || canClose || canDelete;

  return (
    <>
      <AgenticStatusCard {...agenticCardProps} noCollapse hideInlineActions />
      {hasActions && (
        <div className="tab-actions">
          {!needsReview && canStart && startHandler && (
            <button type="button" className="btn" disabled={actionPending} onClick={() => void startHandler()}>
              {startText}
            </button>
          )}
          {!needsReview && canRestart && (
            <button type="button" className="btn" disabled={actionPending} onClick={() => void onRestart()}>
              Wiederholen
            </button>
          )}
          {needsReview && !reviewIntent && (
            <button type="button" className="btn" disabled={actionPending} onClick={() => void onReview()}>
              Review
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn" disabled={actionPending} onClick={() => void onCancel()}>
              Abbrechen
            </button>
          )}
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
      {specFieldModalState ? ReactDOM.createPortal(
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
        />,
        document.body
      ) : null}
    </>
  );
}
