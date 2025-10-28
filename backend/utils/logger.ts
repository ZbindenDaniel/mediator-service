export interface Logger {
  info(message: string, payload?: Record<string, unknown>): void;
  warn(message: string, payload?: Record<string, unknown>): void;
  error(message: string, payload?: Record<string, unknown>): void;
}

interface LoggerOptions {
  scope?: string;
  defaults?: Record<string, unknown>;
}

type LogLevel = 'info' | 'warn' | 'error';

type ConsoleMethod = (message?: any, ...optionalParams: any[]) => void;

const consoleMethods: Record<LogLevel, ConsoleMethod> = {
  info: console.info ? console.info.bind(console) : console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function emit(level: LogLevel, scope: string | undefined, message: string, payload: Record<string, unknown> | undefined): void {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    ...(scope ? { scope } : {}),
    message,
    ...(payload ? { payload } : {})
  };
  consoleMethods[level](entry);
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const { scope, defaults } = options;
  const applyDefaults = (payload?: Record<string, unknown>) => {
    if (!defaults) return payload;
    return { ...defaults, ...(payload ?? {}) };
  };
  return {
    info(message, payload) {
      emit('info', scope, message, applyDefaults(payload));
    },
    warn(message, payload) {
      emit('warn', scope, message, applyDefaults(payload));
    },
    error(message, payload) {
      emit('error', scope, message, applyDefaults(payload));
    }
  };
}

export const defaultLogger = createLogger({ scope: 'app' });
