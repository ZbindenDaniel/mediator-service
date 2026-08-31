import fs from 'fs';
import path from 'path';
import { resolveFetchMediaRoots, formatArtikelNummerForMedia } from './media';
import { resolveExistingMediaPaths } from './media-request';
import type { ShopwareImageInput } from '../shopware/adminClient';

// Extension → MIME for the image types Shopware accepts as product media.
const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif'
};

function imageMeta(fileName: string): { extension: string; contentType: string } | null {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const contentType = IMAGE_MIME[ext];
  return contentType ? { extension: ext, contentType } : null;
}

// Deterministic, collision-safe Shopware media fileName (without extension), scoped per Artikel_Nummer
// so the same product's re-sync reuses the same media and two products can't clash on a shared basename.
function toMediaFileName(artikelNummer: string, originalName: string): string {
  const base = path.basename(originalName).replace(/\.[^.]+$/, '');
  return `${artikelNummer}-${base}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Resolve a ref's images (Grafikname cover first, then ImageNames) to uploadable descriptors with a
// lazy byte loader. Only files that exist on disk and have a known image extension are returned.
export function resolveShopwareImageInputs(
  artikelNummer: string,
  grafikname: string | null,
  imageNames: string | null
): ShopwareImageInput[] {
  const folder = formatArtikelNummerForMedia(artikelNummer) ?? artikelNummer;
  const roots = resolveFetchMediaRoots();

  // Cover (Grafikname) first, then the ImageNames list, de-duplicated by original name.
  const names: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = (raw ?? '').trim();
    if (t && !names.includes(t)) names.push(t);
  };
  push(grafikname);
  for (const n of (imageNames ?? '').split('|')) push(n);

  const inputs: ShopwareImageInput[] = [];
  for (const name of names) {
    const meta = imageMeta(name);
    if (!meta) continue;
    const found = resolveExistingMediaPaths(roots, path.posix.join(folder, name))[0];
    if (!found) continue;
    const filePath = found.filePath;
    inputs.push({
      mediaFileName: toMediaFileName(artikelNummer, name),
      extension: meta.extension,
      contentType: meta.contentType,
      load: () => fs.promises.readFile(filePath)
    });
  }
  return inputs;
}
