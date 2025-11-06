export interface LangChainLogger {
  debug?: Console['debug'];
  warn?: Console['warn'];
  error?: Console['error'];
}

interface StringifyOptions {
  context?: string;
  logger?: LangChainLogger;
}

const IGNORED_TYPES = new Set(['tool_use', 'tool', 'tool_call', 'function', 'ai']);
const MAX_LOGGED_FRAGMENTS = 5;
const MAX_PREVIEW_LENGTH = 240;

type FragmentRecord = {
  path: string;
  type?: string;
  kind?: string;
  name?: string;
  hasInput?: boolean;
  keys?: string[];
  preview?: string;
};

interface ExtractionState {
  textParts: string[];
  unexpected: FragmentRecord[];
  ignored: FragmentRecord[];
  unexpectedTruncated?: boolean;
  ignoredTruncated?: boolean;
}

function previewValue(value: unknown): string {
  try {
    if (typeof value === 'string') {
      return value.length > MAX_PREVIEW_LENGTH ? `${value.slice(0, MAX_PREVIEW_LENGTH)}…` : value;
    }
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'string') {
          return val.length > MAX_PREVIEW_LENGTH ? `${val.slice(0, MAX_PREVIEW_LENGTH)}…` : val;
        }
        return val;
      },
      2
    );
  } catch (err) {
    return `[unserializable: ${(err as Error)?.message ?? String(err)}]`;
  }
}

function record(state: ExtractionState, type: 'ignored' | 'unexpected', fragment: FragmentRecord): void {
  state[type].push(fragment);
  if (state[type].length > MAX_LOGGED_FRAGMENTS) {
    state[type] = state[type].slice(0, MAX_LOGGED_FRAGMENTS);
    state[`${type}Truncated` as const] = true;
  }
}

function extractText(value: unknown, path: string, state: ExtractionState, seen: WeakSet<object>): void {
  if (value == null) {
    return;
  }

  if (typeof value === 'string') {
    state.textParts.push(value);
    return;
  }

  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    state.textParts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      record(state, 'unexpected', { path, kind: 'circular', preview: '[Circular]' });
      return;
    }
    seen.add(value);
    value.forEach((item, index) => {
      extractText(item, `${path}[${index}]`, state, seen);
    });
    return;
  }

  if (typeof value !== 'object') {
    record(state, 'unexpected', { path, kind: typeof value, preview: previewValue(value) });
    return;
  }

  if (seen.has(value)) {
    record(state, 'unexpected', { path, kind: 'circular', preview: '[Circular]' });
    return;
  }
  seen.add(value);

  const typedValue = value as { type?: string; [key: string]: unknown };
  const type = typeof typedValue.type === 'string' ? typedValue.type : undefined;

  if (type === 'text' && typeof typedValue.text === 'string') {
    state.textParts.push(typedValue.text);
    return;
  }

  if (type === 'json') {
    const jsonSource = typedValue.data ?? typedValue.json ?? typedValue.output ?? typedValue.value;
    if (jsonSource !== undefined) {
      try {
        state.textParts.push(typeof jsonSource === 'string' ? jsonSource : JSON.stringify(jsonSource, null, 2));
        return;
      } catch (err) {
        record(state, 'unexpected', {
          path,
          kind: 'json-stringify-error',
          preview: previewValue(jsonSource),
          error: (err as Error)?.message
        });
      }
    }
  }

  if (type && IGNORED_TYPES.has(type)) {
    record(state, 'ignored', {
      path,
      type,
      name: typeof typedValue.name === 'string' ? typedValue.name : undefined,
      hasInput:
        Object.prototype.hasOwnProperty.call(typedValue, 'input') ||
        Object.prototype.hasOwnProperty.call(typedValue, 'args')
    });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(typedValue, 'content')) {
    extractText(typedValue.content, `${path}.content`, state, seen);
    return;
  }

  if (typeof typedValue.text === 'string') {
    state.textParts.push(typedValue.text);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(typedValue, 'message') && typeof typedValue.message === 'string') {
    state.textParts.push(typedValue.message);
    return;
  }

  for (const [key, val] of Object.entries(typedValue)) {
    if (typeof val === 'string' && key.toLowerCase().includes('text')) {
      state.textParts.push(val);
      return;
    }
  }

  record(state, 'unexpected', { path, kind: type ?? 'object', keys: Object.keys(typedValue), preview: previewValue(typedValue) });
}

export function stringifyLangChainContent(content: unknown, options: StringifyOptions = {}): string {
  const logger = options.logger ?? console;
  const context = options.context ?? 'langchain.content';

  try {
    const state: ExtractionState = {
      textParts: [],
      unexpected: [],
      ignored: []
    };
    extractText(content, '$', state, new WeakSet());

    if (state.ignored.length) {
      logger.debug?.({
        msg: 'langchain content ignored fragments',
        context,
        fragments: state.ignored,
        truncated: state.ignoredTruncated ?? false
      });
    }

    if (state.unexpected.length) {
      logger.warn?.({
        msg: 'langchain content unexpected fragments',
        context,
        fragments: state.unexpected,
        truncated: state.unexpectedTruncated ?? false
      });
    }

    return state.textParts.join('');
  } catch (err) {
    logger.error?.({
      msg: 'langchain content conversion failed',
      context,
      err: err instanceof Error ? err.message : err,
      preview: previewValue(content)
    });
    return '';
  }
}
