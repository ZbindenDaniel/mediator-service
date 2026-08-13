import type { AltDocDirectoryConfig } from '../config';
import type { ExternalDocSummary } from '../../models/external-doc';
import {
  resolveAltDocDirPaths,
  buildExternalDocUrl,
  type AltDocResolutionContext,
  type ResolvedAltDocDir
} from './alt-doc-resolver';
import { listFilesInAltDocDirectory } from './media-request';

// Single place that turns a directory + item identity into an ExternalDocSummary, unioning files
// across every accepted identifier type (fallback chain). Used by the external-docs list endpoint
// and the item-detail payload so both surface the same files; `forceReadOnly` is passed by the
// item-detail payload, which never exposes the write/delete affordances.
export function buildExternalDocSummary(
  dirConfig: AltDocDirectoryConfig,
  ctx: AltDocResolutionContext,
  itemUUID: string,
  opts?: { forceReadOnly?: boolean }
): ExternalDocSummary {
  const writable = opts?.forceReadOnly ? false : (dirConfig.writable ?? false);
  const deletable = opts?.forceReadOnly ? false : (dirConfig.deletable ?? false);

  const resolved = resolveAltDocDirPaths(ctx, dirConfig);
  if (resolved.length === 0) {
    return {
      name: dirConfig.name,
      docType: dirConfig.docType ?? null,
      identifierType: dirConfig.identifierType,
      identifierValue: null,
      available: false,
      reason: 'identifier_not_set',
      fileCount: 0,
      files: [],
      writable,
      deletable
    };
  }

  const files = resolved.flatMap((r) =>
    listFilesInAltDocDirectory(dirConfig.mountPath, r.identifierValue).map((fileName) => ({
      fileName,
      url: buildExternalDocUrl(dirConfig.name, itemUUID, fileName)
    }))
  );

  return {
    name: dirConfig.name,
    docType: dirConfig.docType ?? null,
    // The first resolving type is the preferred one shown in the UI header and used as the
    // default write target (e.g. macAddress for a serial-less intake device).
    identifierType: resolved[0].identifierType,
    identifierValue: resolved[0].identifierValue,
    available: true,
    fileCount: files.length,
    files,
    writable,
    deletable
  };
}

// Finds the resolved folder that actually contains a file, checking accepted types in preference
// order — needed because a fallback-chain dir can hold files under more than one folder.
export function resolveExternalDocFileForServe(
  dirConfig: AltDocDirectoryConfig,
  ctx: AltDocResolutionContext,
  safeFileName: string
): ResolvedAltDocDir | null {
  for (const r of resolveAltDocDirPaths(ctx, dirConfig)) {
    if (listFilesInAltDocDirectory(dirConfig.mountPath, r.identifierValue).includes(safeFileName)) {
      return r;
    }
  }
  return null;
}
