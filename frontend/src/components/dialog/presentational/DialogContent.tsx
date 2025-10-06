// TODO: Keep dialog content semantics aligned with accessibility guidance as requirements evolve.
import React, { ForwardedRef, ReactNode, forwardRef, useId } from 'react';

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  message: ReactNode;
}

export const DialogContent = forwardRef(function DialogContent(
  { title, message, className = '', ...rest }: DialogContentProps,
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
      aria-labelledby={title ? titleId : undefined}
      aria-modal="true"
      className={combinedClassName}
      role={rest.role ?? 'dialog'}
      tabIndex={-1}
    >
      {title && (
        <h2 className="dialog-title" id={titleId}>
          {title}
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
