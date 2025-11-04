import { logger } from './logger.js';

const IGNORED_TYPES = new Set(['tool_use', 'tool', 'tool_call', 'function', 'ai']);
const MAX_LOGGED_FRAGMENTS = 5;
const MAX_PREVIEW_LENGTH = 240;

function previewValue(value) {
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
    return `[unserializable: ${err?.message ?? err}]`;
  }
}

function record(state, type, fragment) {
  state[type].push(fragment);
  if (state[type].length > MAX_LOGGED_FRAGMENTS) {
    state[type] = state[type].slice(0, MAX_LOGGED_FRAGMENTS);
    state[`${type}Truncated`] = true;
  }
}

function extractText(value, path, state, seen) {
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

  const type = typeof value.type === 'string' ? value.type : undefined;

  if (type === 'text' && typeof value.text === 'string') {
    state.textParts.push(value.text);
    return;
  }

  if (type === 'json') {
    const jsonSource = value.data ?? value.json ?? value.output ?? value.value;
    if (jsonSource !== undefined) {
      try {
        state.textParts.push(
          typeof jsonSource === 'string' ? jsonSource : JSON.stringify(jsonSource, null, 2)
        );
        return;
      } catch (err) {
        record(state, 'unexpected', {
          path,
          kind: 'json-stringify-error',
          error: err?.message ?? err,
          preview: previewValue(jsonSource),
        });
      }
    }
  }

  if (type && IGNORED_TYPES.has(type)) {
    record(state, 'ignored', {
      path,
      type,
      name: typeof value.name === 'string' ? value.name : undefined,
      hasInput:
        Object.prototype.hasOwnProperty.call(value, 'input') ||
        Object.prototype.hasOwnProperty.call(value, 'args'),
    });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'content')) {
    extractText(value.content, `${path}.content`, state, seen);
    return;
  }

  if (typeof value.text === 'string') {
    state.textParts.push(value.text);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'message') && typeof value.message === 'string') {
    state.textParts.push(value.message);
    return;
  }

  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string' && key.toLowerCase().includes('text')) {
      state.textParts.push(val);
      return;
    }
  }

  record(state, 'unexpected', { path, kind: type ?? 'object', keys: Object.keys(value), preview: previewValue(value) });
}

export function stringifyLangChainContent(content, { context = 'langchain.content' } = {}) {
  try {
    const state = {
      textParts: [],
      unexpected: [],
      ignored: [],
    };
    extractText(content, '$', state, new WeakSet());

    if (state.ignored.length) {
      logger.debug({
        msg: 'langchain content ignored fragments',
        context,
        fragments: state.ignored,
        truncated: state.ignoredTruncated ?? false,
      });
    }

    if (state.unexpected.length) {
      logger.warn({
        msg: 'langchain content unexpected fragments',
        context,
        fragments: state.unexpected,
        truncated: state.unexpectedTruncated ?? false,
      });
    }

    return state.textParts.join('');
  } catch (err) {
    logger.error({
      msg: 'langchain content conversion failed',
      context,
      err: err?.message ?? err,
      preview: previewValue(content),
    });
    return '';
  }
}
