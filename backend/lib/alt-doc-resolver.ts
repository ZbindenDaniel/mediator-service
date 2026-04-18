import path from 'path';
import type { AltDocDirectoryConfig } from '../config';
import { resolvePathWithinRoot } from './path-guard';

export interface AltDocResolutionContext {
  itemUUID: string;
  ean: string | null;
  serialNumber: string | null;
  macAddress: string | null;
}

// EAN: digits only (EAN-8, EAN-13, or extended alphanumeric article numbers)
const EAN_PATTERN = /^[0-9A-Za-z]+$/;
// Serial number: alphanumeric, hyphens, underscores
const SERIAL_PATTERN = /^[a-zA-Z0-9_-]+$/;
// MAC address: hex digits, colons, hyphens
const MAC_PATTERN = /^[0-9A-Fa-f:.-]+$/;

export function validateAltDocIdentifierValue(
  value: string,
  identifierType: AltDocDirectoryConfig['identifierType']
): boolean {
  if (!value) return false;
  switch (identifierType) {
    case 'ean': return EAN_PATTERN.test(value);
    case 'serialNumber': return SERIAL_PATTERN.test(value);
    case 'macAddress': return MAC_PATTERN.test(value);
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

export function resolveAltDocIdentifier(
  ctx: AltDocResolutionContext,
  config: AltDocDirectoryConfig
): string | null {
  let raw: string | null | undefined;
  switch (config.identifierType) {
    case 'ean': raw = ctx.ean; break;
    case 'serialNumber': raw = ctx.serialNumber; break;
    case 'macAddress': raw = ctx.macAddress; break;
  }
  if (!raw) return null;

  const normalized = normalizeAltDocIdentifierValue(raw, config.normalize ?? null);

  if (!validateAltDocIdentifierValue(normalized, config.identifierType)) {
    console.warn('[alt-doc-resolver] Identifier value failed validation, skipping', {
      itemUUID: ctx.itemUUID,
      identifierType: config.identifierType,
      dirName: config.name,
      value: normalized
    });
    return null;
  }

  return normalized;
}

export function resolveAltDocDirPath(
  ctx: AltDocResolutionContext,
  config: AltDocDirectoryConfig
): { dirPath: string; identifierValue: string } | null {
  const identifierValue = resolveAltDocIdentifier(ctx, config);
  if (!identifierValue) return null;

  const dirPath = resolvePathWithinRoot(config.mountPath, identifierValue, {
    operation: `alt-doc-dir:${config.name}`
  });
  if (!dirPath) return null;

  return { dirPath, identifierValue };
}

export function buildExternalDocUrl(dirName: string, itemUUID: string, fileName: string): string {
  return `/external-docs/${encodeURIComponent(dirName)}/${encodeURIComponent(itemUUID)}/${encodeURIComponent(path.basename(fileName))}`;
}
