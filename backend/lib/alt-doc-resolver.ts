import path from 'path';
import type { AltDocDirectoryConfig } from '../config';
import { resolvePathWithinRoot } from './path-guard';

export interface AltDocResolutionContext {
  itemUUID: string;
  ean: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  artikelNummer: string | null;
}

// EAN: digits only (EAN-8, EAN-13, or extended alphanumeric article numbers)
const EAN_PATTERN = /^[0-9A-Za-z]+$/;
// Serial number: alphanumeric, hyphens, underscores
const SERIAL_PATTERN = /^[a-zA-Z0-9_-]+$/;
// MAC address: hex digits, colons, hyphens
const MAC_PATTERN = /^[0-9A-Fa-f:.-]+$/;
// Artikel_Nummer: alphanumeric, dots, hyphens, underscores (covers numeric, zero-padded, and compound codes)
const ARTIKEL_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function validateAltDocIdentifierValue(
  value: string,
  identifierType: AltDocDirectoryConfig['identifierType']
): boolean {
  if (!value) return false;
  switch (identifierType) {
    case 'ean': return EAN_PATTERN.test(value);
    case 'serialNumber': return SERIAL_PATTERN.test(value);
    case 'macAddress': return MAC_PATTERN.test(value);
    case 'artikelNummer': return ARTIKEL_PATTERN.test(value);
  }
}

export function normalizeAltDocIdentifierValue(
  raw: string,
  normalize: AltDocDirectoryConfig['normalize']
): string {
  if (!normalize) return raw;
  switch (normalize) {
    case 'uppercase': return raw.toUpperCase();
    case 'lowercase': return raw.toLowerCase();
    case 'strip-colons': return raw.replace(/:/g, '');
  }
}

// A MAC has one canonical folder form (separators stripped, upper-cased) so the same interface
// keys the same folder whether the netboot image sends "40167eaa9e6b" or the item stored
// "40:16:7e:aa:9e:6b". This is applied for the macAddress type regardless of `normalize`.
export function canonicalizeMacAddress(raw: string): string {
  return raw.replace(/[:.\-]/g, '').toUpperCase();
}

// The ordered list of identifier types a directory accepts. Primary type is always first.
export function acceptedIdentifierTypes(
  config: AltDocDirectoryConfig
): AltDocDirectoryConfig['identifierType'][] {
  const source = (config.identifierTypes && config.identifierTypes.length)
    ? config.identifierTypes
    : [config.identifierType];
  const seen = new Set<string>();
  const out: AltDocDirectoryConfig['identifierType'][] = [];
  for (const t of [config.identifierType, ...source]) {
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

export function resolveAltDocIdentifier(
  ctx: AltDocResolutionContext,
  config: AltDocDirectoryConfig,
  // When the caller declares the identity explicitly (e.g. an SN:/MAC: URL prefix),
  // that declared type wins over the dir's default identifierType — the prefix is the
  // caller telling us which identifier keys the folder, not the dir's DB-lookup default.
  identifierTypeOverride?: AltDocDirectoryConfig['identifierType']
): string | null {
  const identifierType = identifierTypeOverride ?? config.identifierType;
  let raw: string | null | undefined;
  switch (identifierType) {
    case 'ean': raw = ctx.ean; break;
    case 'serialNumber': raw = ctx.serialNumber; break;
    case 'macAddress': raw = ctx.macAddress; break;
    case 'artikelNummer': raw = ctx.artikelNummer; break;
  }
  if (!raw) return null;

  // macAddress has a well-defined canonical form; other types use the dir's `normalize`.
  const normalized = identifierType === 'macAddress'
    ? canonicalizeMacAddress(raw)
    : normalizeAltDocIdentifierValue(raw, config.normalize ?? null);

  if (!validateAltDocIdentifierValue(normalized, identifierType)) {
    console.warn('[alt-doc-resolver] Identifier value failed validation, skipping', {
      itemUUID: ctx.itemUUID,
      identifierType,
      dirName: config.name,
      value: normalized
    });
    return null;
  }

  return normalized;
}

export function resolveAltDocDirPath(
  ctx: AltDocResolutionContext,
  config: AltDocDirectoryConfig,
  identifierTypeOverride?: AltDocDirectoryConfig['identifierType']
): { dirPath: string; identifierValue: string } | null {
  const identifierValue = resolveAltDocIdentifier(ctx, config, identifierTypeOverride);
  if (!identifierValue) return null;

  const dirPath = resolvePathWithinRoot(config.mountPath, identifierValue, {
    operation: `alt-doc-dir:${config.name}`
  });
  if (!dirPath) return null;

  return { dirPath, identifierValue };
}

export interface ResolvedAltDocDir {
  dirPath: string;
  identifierValue: string;
  identifierType: AltDocDirectoryConfig['identifierType'];
}

// Resolves every accepted identifier type that yields a value on the item, in preference order.
// A dir with a single type returns at most one entry; a fallback-chain dir (e.g. serialNumber +
// macAddress) returns one entry per type present, so callers can union files across folders and
// pick the first (preferred) as the write target.
export function resolveAltDocDirPaths(
  ctx: AltDocResolutionContext,
  config: AltDocDirectoryConfig
): ResolvedAltDocDir[] {
  const out: ResolvedAltDocDir[] = [];
  for (const identifierType of acceptedIdentifierTypes(config)) {
    const identifierValue = resolveAltDocIdentifier(ctx, config, identifierType);
    if (!identifierValue) continue;
    const dirPath = resolvePathWithinRoot(config.mountPath, identifierValue, {
      operation: `alt-doc-dir:${config.name}`
    });
    if (!dirPath) continue;
    out.push({ dirPath, identifierValue, identifierType });
  }
  return out;
}

export function buildExternalDocUrl(dirName: string, itemUUID: string, fileName: string): string {
  return `/external-docs/${encodeURIComponent(dirName)}/${encodeURIComponent(itemUUID)}/${encodeURIComponent(path.basename(fileName))}`;
}
