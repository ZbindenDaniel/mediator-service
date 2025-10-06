// TODO: Extend dialog buttons with theming variants when the design system expands.
import React from 'react';

import { DialogType } from '../DialogProvider';

interface DialogButtonsProps {
  type: DialogType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DialogButtons({
  type,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: DialogButtonsProps) {
  const resolveConfirmLabel = () => {
    if (confirmLabel) {
      return confirmLabel;
    }
    if (type === 'confirm' || type === 'prompt') {
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

  return (
    <div className="dialog-buttons">
      {(type === 'confirm' || type === 'prompt') && (
        <button className="secondary" onClick={onCancel} type="button">
          {resolveCancelLabel()}
        </button>
      )}
      <button className="primary" onClick={onConfirm} type="button">
        {resolveConfirmLabel()}
      </button>
    </div>
  );
}
