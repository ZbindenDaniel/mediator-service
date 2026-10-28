import fs from 'fs';

// Deployment-level feature flags (docs/PLANNING_NEW_USE_CASE.md §10.2/§12.2). One manifest decides
// which features this deployment offers: the backend blocks disabled features (action gate, jobs)
// and the frontend hides them (GET /api/app-config). Per-group/role flags were considered and
// deliberately left out for now: there is no use case for groups with different feature sets.
//
// Configure via FEATURES (inline JSON) or FEATURES_FILE (path), e.g. { "agentic": false }.
// Missing keys default to ON, so an unconfigured deployment (revamp-it) keeps every feature.

import { FEATURE_KEYS } from '../../models/features';
import type { FeatureKey } from '../../models/features';

export { FEATURE_KEYS };
export type { FeatureKey };
export type FeatureSet = Record<FeatureKey, boolean>;

const KNOWN = new Set<string>(FEATURE_KEYS);

let cached: FeatureSet | null = null;

function allOn(): FeatureSet {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureSet;
}

// Throws on any malformed manifest; server startup calls loadFeatures() to fail fast (same as the
// taxonomy seed). Failing open would silently re-enable e.g. the paid AI dispatcher; failing closed
// would hide a config mistake behind a half-working app.
export function parseFeatures(raw: string | null): FeatureSet {
  const features = allOn();
  if (!raw) return features;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[features] FEATURES is not valid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[features] FEATURES must be a JSON object like {"agentic": false}');
  }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!KNOWN.has(key)) {
      throw new Error(`[features] Unknown feature "${key}". Known: ${FEATURE_KEYS.join(', ')}`);
    }
    if (typeof value !== 'boolean') {
      throw new Error(`[features] Feature "${key}" must be true or false`);
    }
    features[key as FeatureKey] = value;
  }
  return features;
}

function readRaw(): string | null {
  const inline = (process.env.FEATURES || '').trim();
  if (inline) return inline;
  const file = (process.env.FEATURES_FILE || '').trim();
  if (!file) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`[features] FEATURES_FILE "${file}" unreadable: ${(err as Error).message}`);
  }
}

export function loadFeatures(): FeatureSet {
  if (!cached) cached = parseFeatures(readRaw());
  return cached;
}

export function isFeatureEnabled(key: FeatureKey): boolean {
  return loadFeatures()[key];
}

export function resetFeaturesCache(): void {
  cached = null;
}
