import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DATABASE_URL, DB_PATH } from '../config';

// TODO(persistence-connection): Add metrics hooks once Postgres migrations land in production.
type PostgresPool = {
  connect: () => Promise<{ release: () => void }>;
  query: (queryText: string, values?: unknown[]) => Promise<unknown>;
  on: (event: 'error', listener: (error: unknown) => void) => void;
  end: () => Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString?: string }) => PostgresPool;
};

export type PostgresDbClient = {
  kind: 'postgres';
  pool: PostgresPool;
};

export type SqliteDbClient = {
  kind: 'sqlite';
  db: Database.Database;
};

export type DbClient = PostgresDbClient | SqliteDbClient;

let cachedClient: DbClient | null = null;

function loadPgModule(): PgModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('pg') as PgModule;
  } catch (error) {
    const notFound = (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND';
    if (notFound) {
      console.error(
        '[persistence] DATABASE_URL provided but pg dependency is missing. Run `npm install pg` to enable Postgres support.',
      );
    } else {
      console.error('[persistence] Failed to load pg dependency for Postgres connections', error);
    }
    throw error;
  }
}

function initializePostgresClient(): PostgresDbClient {
  console.info('[persistence] DATABASE_URL detected; initializing Postgres connection pool.');

  try {
    const { Pool } = loadPgModule();
    const pool = new Pool({ connectionString: DATABASE_URL });
    pool.on('error', (error) => {
      console.error('[persistence] Unexpected error from Postgres pool', error);
    });

    pool
      .query('SELECT 1')
      .then(() => {
        console.info('[persistence] Postgres connectivity verified.');
      })
      .catch((error) => {
        console.error('[persistence] Postgres connectivity check failed', error);
      });

    return { kind: 'postgres', pool };
  } catch (error) {
    console.error('[persistence] Failed to initialize Postgres connection pool', error);
    throw error;
  }
}

function initializeSqliteClient(): SqliteDbClient {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  } catch (error) {
    console.error('[persistence] Failed to ensure SQLite directory exists', { dbPath: DB_PATH, error });
    throw error;
  }

  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    console.info('[persistence] SQLite database initialized', { dbPath: DB_PATH });
    return { kind: 'sqlite', db };
  } catch (error) {
    console.error('[persistence] Failed to initialize SQLite database', { dbPath: DB_PATH, error });
    throw error;
  }
}

export function getDbClient(): DbClient {
  if (cachedClient) {
    return cachedClient;
  }

  if (DATABASE_URL) {
    cachedClient = initializePostgresClient();
    return cachedClient;
  }

  cachedClient = initializeSqliteClient();
  return cachedClient;
}
