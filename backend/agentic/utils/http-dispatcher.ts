import { modelHttpConfig, type AgenticModelHttpConfig } from '../config';

// Fallback keeps the util working if `modelHttpConfig` is absent (e.g. a partial config mock in tests);
// production always exports it. Matches the config default (10 min).
const DEFAULT_MODEL_HTTP_CONFIG: AgenticModelHttpConfig = {
  headersTimeoutMs: 600_000,
  bodyTimeoutMs: 600_000
};

type DispatcherLogger = {
  info?: (payload: unknown) => void;
  warn?: (payload: unknown) => void;
};

// Configure once, then reuse the resolved promise so concurrent invocations don't race to install
// competing global dispatchers.
let configurePromise: Promise<void> | null = null;

/**
 * Raise undici's fetch header/body timeouts for model calls.
 *
 * The recurring production failure is `UND_ERR_HEADERS_TIMEOUT` ("fetch failed") when a local Ollama
 * model is slow to return the first response headers (cold VRAM load / GPU contention / heavy prompt).
 * That is a legitimate long wait, not a transport error — but retrying just re-sends the whole prompt
 * into the same wall. The real fix is to move the wall: install a `setGlobalDispatcher` `Agent` with a
 * generous `headersTimeout`/`bodyTimeout`.
 *
 * This is deliberately GLOBAL. Node's built-in `fetch` (which the `ollama` client's browser build uses)
 * reads the dispatcher set here; a per-request dispatcher would require the ollama client to forward a
 * custom `fetch`, which its published surface does not guarantee. The global side effect is acceptable
 * because we only RAISE the ceilings — fast APIs (Tavily/Shopware) answer well within them, and Tavily
 * additionally bounds itself with its own per-request AbortSignal, so their effective behavior is
 * unchanged. Best-effort: if `undici` cannot be loaded we log and fall back to the existing retry path.
 */
export async function ensureModelHttpTimeouts(logger?: DispatcherLogger): Promise<void> {
  if (configurePromise) {
    return configurePromise;
  }
  configurePromise = (async () => {
    const { headersTimeoutMs, bodyTimeoutMs } = modelHttpConfig ?? DEFAULT_MODEL_HTTP_CONFIG;
    try {
      const undici = await import('undici');
      const agent = new undici.Agent({
        headersTimeout: headersTimeoutMs,
        bodyTimeout: bodyTimeoutMs
      });
      undici.setGlobalDispatcher(agent);
      logger?.info?.({
        msg: 'configured model HTTP timeouts (global undici dispatcher)',
        headersTimeoutMs,
        bodyTimeoutMs
      });
    } catch (err) {
      logger?.warn?.({
        err,
        msg: 'failed to configure model HTTP timeouts; falling back to retry-only',
        headersTimeoutMs,
        bodyTimeoutMs
      });
    }
  })();
  return configurePromise;
}
