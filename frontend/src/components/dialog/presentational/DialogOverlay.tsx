// TODO: Maintain overlay styling consistent with the design system when additional themes arrive.
import React, { PropsWithChildren, useCallback } from 'react';

interface DialogOverlayProps extends PropsWithChildren {
  onDismiss: () => void;
}

export function DialogOverlay({ children, onDismiss }: DialogOverlayProps) {
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        try {
          onDismiss();
        } catch (error) {
          console.error('Dialog overlay dismissal failed', error);
        }
      }
    },
    [onDismiss]
  );

  return (
    <div
      className="dialog-overlay"
      onClick={handleMouseDown}
      onMouseDown={handleMouseDown}
      role="presentation"
    >
      {children}
    </div>
  );
}
