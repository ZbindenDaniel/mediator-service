import { query, queryOne, execute } from '../db-client';

interface SettingRow {
  key: string;
  value: string;
}

/** Returns the DB-stored value for key, or envFallback if no override is set. */
export async function getSetting(key: string, envFallback: string): Promise<string> {
  const row = await queryOne<SettingRow>('SELECT key, value FROM system_settings WHERE key = $1', [key]);
  return row?.value ?? envFallback;
}

/** Writes a setting override to the DB. */
export async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO system_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

/** Removes a DB override so the env-var fallback resumes. */
export async function clearSetting(key: string): Promise<void> {
  await execute('DELETE FROM system_settings WHERE key = $1', [key]);
}

/**
 * Fetches multiple settings in one round-trip.
 * keys: { settingKey: envFallbackValue }
 * Returns: { settingKey: resolvedValue }
 */
export async function getAllSettings(keys: Record<string, string>): Promise<Record<string, string>> {
  const keyList = Object.keys(keys);
  if (keyList.length === 0) return {};

  const rows = await query<SettingRow>(
    `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
    [keyList]
  );

  const dbMap = new Map(rows.map((r) => [r.key, r.value]));
  const result: Record<string, string> = {};
  for (const k of keyList) {
    result[k] = dbMap.get(k) ?? keys[k];
  }
  return result;
}

/** Returns whether the setting has a DB override (vs env-var default). */
export async function hasOverride(key: string): Promise<boolean> {
  const row = await queryOne<{ key: string }>('SELECT key FROM system_settings WHERE key = $1', [key]);
  return row !== null;
}
