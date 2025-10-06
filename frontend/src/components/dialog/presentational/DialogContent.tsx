// TODO: Keep dialog content semantics aligned with accessibility guidance as requirements evolve.
import React, { ForwardedRef, ReactNode, forwardRef, useId } from 'react';

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: ReactNode;
  message: ReactNode;
}

export const DialogContent = forwardRef(function DialogContent(
  { heading, message, className = '', ...rest }: DialogContentProps,
  ref: ForwardedRef<HTMLDivElement>
) {
  const titleId = useId();
  const descriptionId = useId();
  const combinedClassName = ['dialog-content', 'card', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...rest}
      ref={ref}
      aria-describedby={descriptionId}
      aria-labelledby={heading ? titleId : undefined}
      aria-modal="true"
      className={combinedClassName}
      role={rest.role ?? 'dialog'}
      tabIndex={-1}
    >
      {heading && (
        <h2 className="dialog-title" id={titleId}>
          {heading}
        </h2>
      )}
      <div className="dialog-message" id={descriptionId}>
        {message}
      </div>
      <div className="dialog-body">
        {rest.children}
      </div>
    </div>
  );
});

DialogContent.displayName = 'DialogContent';
