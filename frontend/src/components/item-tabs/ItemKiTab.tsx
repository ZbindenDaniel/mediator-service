import React from 'react';
import ReactDOM from 'react-dom';
import { AgenticStatusCard, type AgenticStatusCardProps } from '../AgenticStatusCard';
import { AgenticSnapshotsPanel } from '../AgenticSnapshotsPanel';
import type { AgenticSnapshotFields } from '../../../../models';
import AgenticSpecFieldReviewModal, {
  AgenticContractFieldReviewModal,
  type AgenticSpecFieldOption,
  type AgenticSpecFieldReviewResult,
  type AgenticContractFieldReviewResult,
  type SpecContractFieldEntry
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

export interface ContractFieldModalState {
  title: string;
  description?: string;
  contractFields: SpecContractFieldEntry[];
  additionalFields?: Record<string, string | string[]>;
}

interface Props {
  agenticCardProps: AgenticStatusCardProps;
  specFieldModalState: SpecFieldModalState | null;
  onSpecFieldModalClose: () => void;
  onSpecFieldModalConfirm: (result: AgenticSpecFieldReviewResult) => void;
  contractFieldModalState?: ContractFieldModalState | null;
  onContractFieldModalClose?: () => void;
  onContractFieldModalConfirm?: (result: AgenticContractFieldReviewResult) => void;
  // Targeted rework ("KI Überarbeitung"): selectable fields + a submit handler. Kept local to this tab
  // so it doesn't perturb the review-modal state machine in ItemDetail.
  reworkFieldOptions?: AgenticSpecFieldOption[];
  onReworkSubmit?: (result: AgenticSpecFieldReviewResult) => void | Promise<void>;
  canClose: boolean;
  onClose?: () => void | Promise<void>;
  canDelete: boolean;
  onDelete?: () => void | Promise<void>;
  actionPending: boolean;
  // Run-history panel (versioned enriched state): the item's Artikelnummer, its current AI-written
  // fields (to diff against), and a callback to refresh the item after a restore.
  snapshotArtikelNummer?: string | null;
  snapshotCurrentFields?: AgenticSnapshotFields;
  onSnapshotRestored?: () => void;
}

export default function ItemKiTab({
  agenticCardProps,
  specFieldModalState,
  onSpecFieldModalClose,
  onSpecFieldModalConfirm,
  contractFieldModalState,
  onContractFieldModalClose,
  onContractFieldModalConfirm,
  reworkFieldOptions,
  onReworkSubmit,
  canClose,
  onClose,
  canDelete,
  onDelete,
  actionPending,
  snapshotArtikelNummer,
  snapshotCurrentFields,
  onSnapshotRestored
}: Props) {
  const { canStart, canRestart, canCancel, needsReview, reviewIntent, startLabel, onStart, onRestart, onCancel, onReview } = agenticCardProps;
  const startHandler = onStart ?? onRestart;
  const startText = typeof startLabel === 'string' && startLabel.trim() ? startLabel : 'Starten';

  const [reworkOpen, setReworkOpen] = React.useState(false);
  const canRework = !needsReview && Boolean(onReworkSubmit) && (reworkFieldOptions?.length ?? 0) > 0;

  const hasActions = canStart || canRestart || canCancel || needsReview || canClose || canDelete || canRework;

  return (
    <>
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
          {canRework && (
            <button type="button" className="btn" disabled={actionPending} onClick={() => setReworkOpen(true)}>
              KI Überarbeitung
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
      <AgenticStatusCard {...agenticCardProps} noCollapse hideInlineActions />
      {snapshotArtikelNummer ? (
        <AgenticSnapshotsPanel
          artikelNummer={snapshotArtikelNummer}
          currentFields={snapshotCurrentFields ?? {}}
          onRestored={onSnapshotRestored}
        />
      ) : null}
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
      {reworkOpen && onReworkSubmit ? ReactDOM.createPortal(
        <AgenticSpecFieldReviewModal
          title="KI Überarbeitung"
          description="Wähle die Felder, die überarbeitet werden sollen, und beschreibe die gewünschte Änderung (z. B. „ins Deutsche übersetzen“). Alle anderen Felder bleiben unverändert."
          fieldOptions={reworkFieldOptions ?? []}
          includeAdditionalInput
          additionalInputPlaceholder="Anweisung für die Überarbeitung"
          onCancel={() => setReworkOpen(false)}
          onConfirm={(result) => { setReworkOpen(false); void onReworkSubmit(result); }}
        />,
        document.body
      ) : null}
      {contractFieldModalState && onContractFieldModalClose && onContractFieldModalConfirm ? ReactDOM.createPortal(
        <AgenticContractFieldReviewModal
          title={contractFieldModalState.title}
          description={contractFieldModalState.description}
          contractFields={contractFieldModalState.contractFields}
          additionalFields={contractFieldModalState.additionalFields}
          onCancel={onContractFieldModalClose}
          onConfirm={onContractFieldModalConfirm}
        />,
        document.body
      ) : null}
    </>
  );
}
