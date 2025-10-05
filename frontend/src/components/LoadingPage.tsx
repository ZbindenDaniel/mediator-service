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

const FLYER_WORD = 'revamp';
const FLYER_LETTERS = [...FLYER_WORD];
const COLORES = ['#ff4d4d', '#ffb84d', '#ffff4d', '#4dff4d', '#4dffff', '#4d4dff', '#ff4dff'];
const FLYER_COUNT = 6*10; // FLYER_LETTERS.length * N
const FLYER_SPEED_SECONDS = 6.5;
const FLYER_FREQUENCY_SECONDS = 0.4;

type FlyerConfig = {
  character: string;
  variant: number;
  delay: number;
  color: string;
};

const LoadingPage: React.FC<LoadingPageProps> = ({
  message = 'Loading…',
  children,
  className,
}) => {
  const rootClassName = ['loading-page', className].filter(Boolean).join(' ');
  const rootStyle = React.useMemo(
    () =>
      ({
        '--flyer-speed': `${FLYER_SPEED_SECONDS}s`,
        '--flyer-frequency': `${FLYER_FREQUENCY_SECONDS}s`,
      }) as React.CSSProperties,
    [
      FLYER_SPEED_SECONDS,
      FLYER_FREQUENCY_SECONDS,
    ],
  );

  const flyers = React.useMemo(() => {
    try {
      return Array.from({ length: FLYER_COUNT }).map((_, index) => ({
        character: FLYER_LETTERS[index % FLYER_LETTERS.length],
        variant: index % 6 + 1, // between 1 and 6
        delay: Math.random() * FLYER_LETTERS.length * FLYER_FREQUENCY_SECONDS,
        color: COLORES[Math.floor(Math.random() * COLORES.length)]
      })) as FlyerConfig[];
    } catch (error) {
      console.error('[LoadingPage] Failed to build flyers', error);
      return [] as FlyerConfig[];
    }
  }, [FLYER_COUNT, FLYER_FREQUENCY_SECONDS, FLYER_LETTERS]);

  React.useEffect(() => {
    console.debug('[LoadingPage] flyer configuration', {
      speedSeconds: FLYER_SPEED_SECONDS,
      frequencySeconds: FLYER_FREQUENCY_SECONDS,
      totalFlyers: FLYER_COUNT,
      word: FLYER_WORD,
    });
  }, [FLYER_COUNT, FLYER_FREQUENCY_SECONDS, FLYER_SPEED_SECONDS, FLYER_WORD]);

  console.debug(flyers)
  return (
    <div className={rootClassName} role="status" aria-live="polite" style={rootStyle}>
      <div className="loading-page__flyers" aria-hidden="true">
        {flyers.map((flyer, index) => (
          <span
            key={`loading-flyer-${index}`}
            className={`loading-page__flyer loading-page__flyer--${flyer.variant}`}
            style={{
              animationDelay: `${flyer.delay}s`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              color: `${flyer.color}`
            }}
          >
            {flyer.character}
          </span>
        ))}
      </div>

      {/* <div className="loading-page__spinner" aria-hidden="true" /> */}

      {(children || message) && (
        <div className="loading-page__message">
          {children ?? message}
        </div>
      )}
    </div>
  );
};

export default LoadingPage;
