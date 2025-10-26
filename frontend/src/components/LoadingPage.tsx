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
// const FLYER_LETTERS = ['😄', '😚', '👌🏿', ,'🦚', '🦜', '🐉', '🦥', '🐦‍🔥', '🍋']; // https://getemoji.com/
 const FLYER_LETTERS = [
'💻',
'📟',
'📦',
'📠',
'💾',
'📦',
'🖱️',
'⌨️',
'🖨️',
'🖥️',
'💻']

const COLORES = ['#ff4d4d', '#ffb84d', '#ffff4d', '#4dff4d', '#4dffff', '#4d4dff', '#ff4dff'];
const FLYER_COUNT = 6 * 10; // FLYER_LETTERS.length * N
const FLYER_SPEED_SECONDS = 6.5;
const FLYER_FREQUENCY_SECONDS = 0.4;

type FlyerConfig = {
  character: string;
  variant: number;
  delay: number;
  color: string;
  position: {
    top: number;
    left: number;
  };
};

type SafeArea = {
  top: [number, number];
  left: [number, number];
};

const getSafeFlyerArea = (): SafeArea => {
  const defaultArea: SafeArea = {
    top: [12, 88],
    left: [8, 92],
  };

  if (typeof window === 'undefined') {
    return defaultArea;
  }

  const isCompactWidth = window.innerWidth <= 600;
  const verticalBuffer = isCompactWidth ? 18 : 12;
  const horizontalBuffer = isCompactWidth ? 10 : 8;

  return {
    top: [verticalBuffer, Math.max(verticalBuffer, 100 - verticalBuffer)],
    left: [horizontalBuffer, Math.max(horizontalBuffer, 100 - horizontalBuffer)],
  };
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

  const [safeArea, setSafeArea] = React.useState<SafeArea>(() => getSafeFlyerArea());

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      try {
        setSafeArea((previous) => {
          const nextArea = getSafeFlyerArea();
          const isUnchanged =
            previous.top[0] === nextArea.top[0]
            && previous.top[1] === nextArea.top[1]
            && previous.left[0] === nextArea.left[0]
            && previous.left[1] === nextArea.left[1];

          return isUnchanged ? previous : nextArea;
        });
      } catch (error) {
        console.error('[LoadingPage] Failed to update flyer safe area', error);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const flyers = React.useMemo(() => {
    try {
      const [minTop, maxTop] = safeArea.top;
      const [minLeft, maxLeft] = safeArea.left;

      const randomWithinRange = (min: number, max: number) => min + Math.random() * (max - min);

      return Array.from({ length: FLYER_COUNT }).map((_, index) => ({
        character: FLYER_LETTERS[index % FLYER_LETTERS.length],
        variant: index % 6 + 1, // between 1 and 6
        delay: Math.random() * FLYER_LETTERS.length * FLYER_FREQUENCY_SECONDS,
        color: COLORES[Math.floor(Math.random() * COLORES.length)],
        position: {
          top: randomWithinRange(minTop, maxTop),
          left: randomWithinRange(minLeft, maxLeft),
        },
      })) as FlyerConfig[];
    } catch (error) {
      console.error('[LoadingPage] Failed to build flyers', error);
      return [] as FlyerConfig[];
    }
  }, [safeArea]);

  React.useEffect(() => {
    console.debug('[LoadingPage] flyer safe area updated', safeArea);
  }, [safeArea]);

  React.useEffect(() => {
    console.debug('[LoadingPage] flyer configuration', {
      speedSeconds: FLYER_SPEED_SECONDS,
      frequencySeconds: FLYER_FREQUENCY_SECONDS,
      totalFlyers: FLYER_COUNT,
      word: FLYER_WORD,
    });
  }, []);

  React.useEffect(() => {
    console.debug('[LoadingPage] flyer batch prepared', {
      count: flyers.length,
    });
  }, [flyers]);

  return (
    <div className={rootClassName} role="status" aria-live="polite" style={rootStyle}>
      <div className="loading-page__flyers" aria-hidden="true">
        {flyers.map((flyer, index) => (
          <span
            key={`loading-flyer-${index}`}
            className={`loading-page__flyer loading-page__flyer--${flyer.variant}`}
            style={{
              animationDelay: `${flyer.delay}s`,
              top: `${flyer.position.top.toFixed(2)}%`,
              left: `${flyer.position.left.toFixed(2)}%`,
              color: `${flyer.color}`
            }}
          >
            {flyer.character}
          </span>
        ))}
      </div>

      <div className="loading-page__spinner" aria-hidden="true" />

      {(children || message) && (
        <div className="loading-page__message">
          {children ?? message}
        </div>
      )}
    </div>
  );
};

export default LoadingPage;
