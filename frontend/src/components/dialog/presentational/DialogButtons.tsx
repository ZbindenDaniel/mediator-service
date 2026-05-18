// TODO: Extend dialog buttons with theming variants when the design system expands.
import React from 'react';

import { DialogType } from '../DialogProvider';

interface DialogButtonsProps {
  type: DialogType;
  confirmLabel?: string;
  cancelLabel?: string;
  rejectLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onReject?: () => void;
}

export function DialogButtons({
  type,
  confirmLabel,
  cancelLabel,
  rejectLabel,
  onConfirm,
  onCancel,
  onReject
}: DialogButtonsProps) {
  const resolveConfirmLabel = () => {
    if (confirmLabel) {
      return confirmLabel;
    }
    if (type === 'confirm' || type === 'prompt' || type === 'threeWay') {
      return 'OK';
    }
    return 'Schließen';
  };

  const resolveCancelLabel = () => {
    if (cancelLabel) {
      return cancelLabel;
    }
    return 'Abbrechen';
  };

  const resolveRejectLabel = () => rejectLabel ?? 'Nein';

  return (
    <div className="dialog-buttons">
      {(type === 'confirm' || type === 'prompt' || type === 'threeWay') && (
        <button className="secondary" onClick={onCancel} type="button">
          {resolveCancelLabel()}
        </button>
      )}
      {type === 'threeWay' && onReject && (
        <button className="secondary" onClick={onReject} type="button">
          {resolveRejectLabel()}
        </button>
      )}
      <button className="primary" onClick={onConfirm} type="button">
        {resolveConfirmLabel()}
      </button>
    </div>
  );
}
