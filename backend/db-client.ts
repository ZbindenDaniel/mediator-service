import { Pool, PoolClient } from 'pg';
import { DATABASE_URL } from './config';

// Defer pool creation so module import doesn't throw in test environments.
// Actual connection errors surface on first query.
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    if (!DATABASE_URL) {
      throw new Error('[db-client] DATABASE_URL is required. Set DATABASE_URL to a PostgreSQL connection string.');
    }
    _pool = new Pool({ connectionString: DATABASE_URL });
    _pool.on('error', (err) => {
      console.error('[db-client] Unexpected Postgres pool error', err);
    });
  }
  return _pool;
}

/** Exposed for direct use in scripts and integration tests that already have DATABASE_URL set. */
export function getPoolInstance(): Pool { return getPool(); }

/** Execute a query and return all rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await (getPool().query as any)(sql, params);
  return result.rows as T[];
}

/** Execute a query and return the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Execute a mutation and return the affected row count. */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<number> {
  const result = await getPool().query(sql, params as any[]);
  return result.rowCount ?? 0;
}

/** Execute an INSERT...RETURNING and return the first returned row. */
export async function insert<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const result = await (getPool().query as any)(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error('[db-client] INSERT returned no row');
  return row as T;
}

/** Run a function inside a transaction. Rolls back on error. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Converts SQLite-style named params (@Foo) to Postgres positional params ($1, $2, ...).
 * The params object values are ordered by first appearance of each name in the SQL.
 */
export function namedToPositional(
  sql: string,
  params: Record<string, unknown>
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const nameToIndex = new Map<string, number>();
  const text = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
    if (!nameToIndex.has(name)) {
      nameToIndex.set(name, values.length + 1);
      values.push(Object.prototype.hasOwnProperty.call(params, name) ? params[name] : null);
    }
    return `$${nameToIndex.get(name)}`;
  });
  return { text, values };
}

/** Execute a named-param query (@Foo style) and return all rows. */
export async function namedQuery<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const { text, values } = namedToPositional(sql, params);
  return query<T>(text, values);
}

/** Execute a named-param query and return the first row, or null. */
export async function namedQueryOne<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown>
): Promise<T | null> {
  const { text, values } = namedToPositional(sql, params);
  return queryOne<T>(text, values);
}

/** Execute a named-param mutation and return affected row count. */
export async function namedExecute(
  sql: string,
  params: Record<string, unknown>
): Promise<number> {
  const { text, values } = namedToPositional(sql, params);
  return execute(text, values);
}

/** Execute multiple statements in a single batch (schema setup). */
export async function execBatch(sql: string): Promise<void> {
  await getPool().query(sql);
}

/** Close the pool (used on graceful shutdown). */
export async function closePool(): Promise<void> {
  if (_pool) await _pool.end();
}
