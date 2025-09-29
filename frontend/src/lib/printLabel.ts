export interface PrintLabelOptions {
  win?: Window & typeof globalThis;
  storage?: Storage | null;
  logger?: Pick<typeof console, 'error' | 'warn'>;
  origin?: string;
  now?: () => number;
  random?: () => number;
}

export interface PrintLabelResult {
  success: boolean;
  status: string;
}

export function openPrintLabel(template: string, payload: unknown, options?: PrintLabelOptions): PrintLabelResult {
  const fallbackWindow = typeof window !== 'undefined' ? window : undefined;
  const win = options?.win ?? fallbackWindow;
  if (!win) {
    throw new Error('No window context available for printing');
  }

  const logger = options?.logger ?? console;

  let storage: Storage | null | undefined = options?.storage;
  if (storage === undefined) {
    try {
      storage = win.localStorage;
    } catch (localErr) {
      logger.warn('Local storage unavailable for print payload caching', localErr as Error);
      storage = undefined;
    }
  }

  if (storage === undefined) {
    try {
      storage = win.sessionStorage;
    } catch (sessionErr) {
      logger.warn('Session storage unavailable for print payload caching', sessionErr as Error);
      storage = null;
    }
  }
  const activeStorage: Storage | null = storage ?? null;
  const origin = options?.origin ?? (win.location ? win.location.origin : '*');
  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;

  let key: string | null = null;
  if (activeStorage) {
    try {
      const serialized = JSON.stringify(payload);
      key = `print:payload:${now()}:${random().toString(16).slice(2)}`;
      activeStorage.setItem(key, serialized);
    } catch (storageErr) {
      logger.error('Failed to cache print payload', storageErr);
      key = null;
    }
  }

  const target = key ? `${template}?key=${encodeURIComponent(key)}` : template;
  let popup: (Window) | null = null;
  try {
    popup = win.open(target, '_blank', 'noopener');
  } catch (openErr) {
    logger.error('Failed to open print window', openErr);
    popup = null;
  }

  if (!popup) {
    if (key && activeStorage) {
      try {
        activeStorage.removeItem(key);
      } catch (removeErr) {
        logger.warn('Failed to clean up cached print payload key', removeErr);
      }
    }
    return {
      success: false,
      status: 'Pop-ups blockiert? Bitte erlauben, um Etikett zu öffnen.'
    };
  }

  const message = { payload };
  const post = () => {
    if (popup && popup.closed) return;
    try {
      popup?.postMessage(message, origin);
    } catch (postErr) {
      logger.error('Failed to send print payload via postMessage', postErr);
    }
  };

  try {
    win.setTimeout(post, 100);
    win.setTimeout(post, 500);
  } catch (timerErr) {
    logger.warn('Failed to schedule print payload delivery retries', timerErr);
    post();
  }

  try {
    popup.focus();
  } catch (focusErr) {
    logger.warn('Unable to focus print window', focusErr);
  }

  return {
    success: true,
    status: key
      ? 'Vorlage geöffnet. Bitte Druckdialog nutzen.'
      : 'Vorlage geöffnet. Daten wurden direkt übertragen.'
  };
}
