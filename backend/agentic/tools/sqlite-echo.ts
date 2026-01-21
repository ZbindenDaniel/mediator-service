import type { JsonLogger } from '../utils/json';

export interface SqliteEchoLogger extends JsonLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface SqliteEchoOptions {
  logger?: SqliteEchoLogger;
}

export interface SqliteEchoResult {
  query: string;
  note?: string;
}

export async function echoSqliteQuery(query: unknown, options: SqliteEchoOptions = {}): Promise<SqliteEchoResult> {
  const logger = options.logger ?? console;
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';

  if (!normalizedQuery) {
    logger.warn?.({ msg: 'postgres echo skipped empty query' });
    return { query: '', note: 'empty-query' };
  }

  try {
    logger.info?.({
      msg: 'postgres echo prepared',
      preview: normalizedQuery.slice(0, 120)
    });
  } catch (err) {
    logger.debug?.({ msg: 'postgres echo logging failed', err });
  }

  // TODO(pg-migration): Replace echo with validated Postgres execution once dry-run mode is lifted.
  return { query: normalizedQuery };
}
