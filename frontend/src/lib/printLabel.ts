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
  let origin = options?.origin;
  if (!origin) {
    try {
      origin = win.location?.origin || '*';
    } catch (originErr) {
      logger.warn('Unable to resolve window origin for print payload delivery', originErr as Error);
      origin = '*';
    }
  }
  if (origin === 'null') {
    origin = '*';
  }
  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;

  let key: string | null = null;
  let channelName: string | null = null;
  try {
    channelName = `print:channel:${now()}:${random().toString(16).slice(2)}`;
  } catch (channelErr) {
    logger.warn('Failed to allocate broadcast channel name for print payload', channelErr as Error);
    channelName = null;
  }
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

  let target = template;
  const params = new URLSearchParams();
  if (key) {
    params.set('key', key);
  }
  if (channelName) {
    params.set('channel', channelName);
  }
  const query = params.toString();
  if (query) {
    try {
      const targetUrl = new URL(template, win.location?.origin ?? undefined);
      if (targetUrl.search) {
        const existing = targetUrl.search.replace(/^\?/, '');
        const merged = `${existing}&${query}`;
        targetUrl.search = `?${merged}`;
      } else {
        targetUrl.search = `?${query}`;
      }
      target = targetUrl.toString();
    } catch (urlErr) {
      logger.warn('Failed to normalise print template URL, appending params manually', urlErr as Error);
      const joiner = template.includes('?') ? '&' : '?';
      target = `${template}${joiner}${query}`;
    }
  }
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

  const message = { type: 'print:payload', payload };
  let broadcast: BroadcastChannel | null = null;
  if (channelName && typeof win.BroadcastChannel === 'function') {
    try {
      broadcast = new win.BroadcastChannel(channelName);
    } catch (channelErr) {
      logger.warn('Unable to open broadcast channel for print payload delivery', channelErr as Error);
      broadcast = null;
    }
  } else if (channelName) {
    logger.warn('BroadcastChannel API unavailable; relying on window messaging for print payload delivery');
  }

  const broadcastMessage = () => {
    if (!broadcast) return;
    try {
      broadcast.postMessage(message);
    } catch (broadcastErr) {
      logger.error('Failed to publish print payload via broadcast channel', broadcastErr as Error);
    }
  };

  const cleanupBroadcast = () => {
    if (!broadcast) return;
    try {
      broadcast.close();
    } catch (closeErr) {
      logger.warn('Failed to close print broadcast channel', closeErr as Error);
    }
    broadcast = null;
  };

  const post = () => {
    if (popup && popup.closed) return;
    try {
      popup?.postMessage(message, origin);
    } catch (postErr) {
      logger.error('Failed to send print payload via postMessage', postErr);
    }
    broadcastMessage();
  };

  const handleRequest = (event: MessageEvent) => {
    if (!popup || popup.closed) {
      cleanupRequestListener();
      return;
    }
    if (event.source !== popup) {
      return;
    }
    let data: unknown = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (parseErr) {
        logger.warn('Ignoring non-JSON string message from print window', parseErr);
        return;
      }
    }
    if (!data || typeof data !== 'object') {
      return;
    }
    const type = (data as { type?: string }).type;
    if (type === 'print:request-payload') {
      post();
    }
  };

  const cleanupRequestListener = () => {
    try {
      win.removeEventListener('message', handleRequest as EventListener);
    } catch (removeErr) {
      logger.warn('Failed to detach print payload request listener', removeErr as Error);
    }
  };

  try {
    win.addEventListener('message', handleRequest as EventListener);
  } catch (listenErr) {
    logger.warn('Unable to listen for print payload requests', listenErr as Error);
  }

  try {
    const stopCheck = win.setInterval(() => {
      if (!popup || popup.closed) {
        cleanupRequestListener();
        cleanupBroadcast();
        try {
          win.clearInterval(stopCheck);
        } catch (intervalErr) {
          logger.warn('Failed to clear print payload request timer', intervalErr as Error);
        }
      }
    }, 2000);
  } catch (intervalErr) {
    logger.warn('Unable to schedule print payload listener cleanup', intervalErr as Error);
  }

  if (broadcast) {
    const handleBroadcast = (event: MessageEvent) => {
      if (!event?.data || typeof event.data !== 'object') {
        return;
      }
      const type = (event.data as { type?: string }).type;
      if (type === 'print:request-payload') {
        post();
      }
    };
    try {
      broadcast.addEventListener('message', handleBroadcast as EventListener);
    } catch (listenErr) {
      logger.warn('Failed to attach listener for print broadcast channel', listenErr as Error);
    }
  }

  try {
    win.setTimeout(post, 100);
    win.setTimeout(post, 500);
    win.setTimeout(post, 1000);
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
