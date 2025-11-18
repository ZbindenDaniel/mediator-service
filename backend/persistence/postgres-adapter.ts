import type { SqlitePersistenceAdapter } from '../db';
import type { PostgresDbClient } from './connection';

// TODO(persistence): Flesh out Postgres adapter queries to match sqlite contract.
export function createPostgresPersistenceAdapter(
  _client: PostgresDbClient,
  logger: { error: (...args: unknown[]) => void } = console
): SqlitePersistenceAdapter {
  logger.error('[persistence] Postgres adapter requested but not implemented for sync repositories.');
  throw new Error('Postgres-backed persistence requires async repository support.');
}
