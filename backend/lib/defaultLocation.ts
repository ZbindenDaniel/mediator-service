import type Database from 'better-sqlite3';
import { itemCategories } from '../../models';
import { db } from '../db';

interface EnsureDefaultLocationOptions {
  database?: Database.Database;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

function normalizeSubcategoryCode(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }

  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function formatLocationId(code: number): string {
  return `S-${String(code).padStart(4, '0')}-0001`;
}

function resolveSubcategoryLabel(code: number): string | null {
  for (const category of itemCategories) {
    for (const subcategory of category.subcategories) {
      if (subcategory.code === code) {
        return subcategory.label;
      }
    }
  }

  return null;
}

export function ensureDefaultLocationForSubcategory(
  subcategoryCode: unknown,
  options: EnsureDefaultLocationOptions = {}
): string | null {
  const database = options.database ?? db;
  const logger = options.logger ?? console;

  const normalizedCode = normalizeSubcategoryCode(subcategoryCode);
  if (normalizedCode === null) {
    logger.warn('[default-location] Missing or invalid subcategory code for default location lookup', {
      provided: subcategoryCode
    });
    return null;
  }

  const locationId = formatLocationId(normalizedCode);

  try {
    const existing = database
      .prepare(`SELECT BoxID, LocationId, Label FROM boxes WHERE BoxID = ? OR LocationId = ? LIMIT 1`)
      .get(locationId, locationId) as { BoxID?: string; LocationId?: string | null; Label?: string | null } | undefined;

    if (existing?.BoxID) {
      return existing.BoxID;
    }

    const label = resolveSubcategoryLabel(normalizedCode);
    const now = new Date().toISOString();
    const insertPayload = {
      BoxID: locationId,
      LocationId: locationId,
      Label: label ? `Regal ${label}` : locationId,
      CreatedAt: now,
      UpdatedAt: now
    };

    database
      .prepare(
        `INSERT OR IGNORE INTO boxes (BoxID, LocationId, Label, CreatedAt, UpdatedAt) VALUES (@BoxID, @LocationId, @Label, @CreatedAt, @UpdatedAt)`
      )
      .run(insertPayload);

    logger.info('[default-location] Created missing default location box', {
      subcategoryCode: normalizedCode,
      locationId,
      label: insertPayload.Label
    });

    return locationId;
  } catch (error) {
    logger.error('[default-location] Failed to ensure default location', {
      subcategoryCode: normalizedCode,
      locationId,
      error
    });
    return null;
  }
}

export function deriveLocationIdFromSubcategory(subcategoryCode: unknown): string | null {
  const normalizedCode = normalizeSubcategoryCode(subcategoryCode);
  return normalizedCode === null ? null : formatLocationId(normalizedCode);
}
