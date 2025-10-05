import React from 'react';

export interface LoadingPageProps {
  /**
   * Optional message displayed beneath the spinner. Defaults to a simple loading hint.
   */
  message?: string;
  /**
   * Optional additional content to render underneath the spinner.
   */
  children?: React.ReactNode;
  /**
   * Extra class names appended to the root element.
   */
  className?: string;
}

const LETTERS = ['r', 'e', 'v', 'a', 'm', 'p', '!'];

const LoadingPage: React.FC<LoadingPageProps> = ({
  message = 'Loading…',
  children,
  className,
}) => {
  const rootClassName = ['loading-page', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} role="status" aria-live="polite">
      <div className="loading-page__flyers" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, index) => (
          <span
            key={`loading-r-${index}`}
            className={`loading-page__flyer loading-page__flyer--${(index % 4) + 1}`}
          >
            r
          </span>
        ))}
      </div>

      <div className="loading-page__spinner" aria-hidden="true">
        {LETTERS.map((letter, index) => (
          <span key={`${letter}-${index}`} style={{ '--index': index } as React.CSSProperties}>
            {letter}
          </span>
        ))}
      </div>

      {(children || message) && (
        <div className="loading-page__message">
          {children ?? message}
        </div>
      )}
    </div>
  );
};

export default LoadingPage;
