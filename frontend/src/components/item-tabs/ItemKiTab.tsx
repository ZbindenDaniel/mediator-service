import React from 'react';
import ReactDOM from 'react-dom';
import { AgenticStatusCard, type AgenticStatusCardProps } from '../AgenticStatusCard';
import { AgenticSnapshotsPanel } from '../AgenticSnapshotsPanel';
import type { AgenticSnapshotFields } from '../../../../models';
import AgenticSpecFieldReviewModal, {
  type AgenticSpecFieldOption,
  type AgenticSpecFieldReviewResult
} from '../AgenticSpecFieldReviewModal';
import { AgenticReviewWizard, type AgenticReviewWizardData, type AgenticReviewWizardResult } from '../AgenticReviewWizard';
import { FindingsPanel } from '../FindingsPanel';
import { DataQualityBadge } from '../DataQualityBadge';
import type { Finding } from '../../../../models/agentic-findings';
import type { DataQualityGrade } from '../../../../models/data-quality';

interface Props {
  agenticCardProps: AgenticStatusCardProps;
  // Persistent findings for the current run ("Zu prüfen") — shown in the tab, not only during review.
  findings?: Finding[];
  // Lever L5a: resolve a surfaced finding by regenerating its field (replaces the blind field-picker as
  // the primary rework entry). Omitted → findings stay read-only.
  onFixFinding?: (finding: Finding) => void;
  // Catalogue data-quality grade (L10), derived on read; shown as a badge above the findings.
  dataQuality?: DataQualityGrade | null;
  reviewWizardState?: AgenticReviewWizardData | null;
  onReviewWizardResolve?: (result: AgenticReviewWizardResult | null) => void;
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
  findings,
  onFixFinding,
  dataQuality,
  reviewWizardState,
  onReviewWizardResolve,
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
          {/* L5a: demoted to a secondary manual fallback — the primary rework path is now the per-finding
              "Beheben" action below. Relabelled so it reads as "pick fields by hand", not a peer of Starten. */}
          {canRework && (
            <button type="button" className="btn secondary" disabled={actionPending} onClick={() => setReworkOpen(true)}>
              Feld manuell überarbeiten…
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
      <DataQualityBadge quality={dataQuality ?? null} />
      <FindingsPanel findings={findings ?? []} onFix={onFixFinding} busy={actionPending} />
      {snapshotArtikelNummer ? (
        <AgenticSnapshotsPanel
          artikelNummer={snapshotArtikelNummer}
          currentFields={snapshotCurrentFields ?? {}}
          onRestored={onSnapshotRestored}
        />
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
      {reviewWizardState && onReviewWizardResolve ? ReactDOM.createPortal(
        <AgenticReviewWizard data={reviewWizardState} onResolve={onReviewWizardResolve} />,
        document.body
      ) : null}
    </>
  );
}
