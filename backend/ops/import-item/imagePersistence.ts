import fs from 'fs';
import path from 'path';
import type { Logger } from '../../utils/logger';

export interface ImagePersistenceOptions {
  itemUUID: string;
  mediaDir: string;
  images: string[];
  artikelNummer?: string;
  logger: Logger;
}

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z]+);base64,(.+)$/;

export function persistItemImages(options: ImagePersistenceOptions): string {
  const { itemUUID, mediaDir, images, artikelNummer, logger } = options;
  if (!images.length) return '';

  const article = (artikelNummer || '').trim() || itemUUID;
  const targetDir = path.join(mediaDir, itemUUID);
  let firstImage = '';

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    logger.error('Failed to prepare media directory for item', {
      itemUUID,
      error: (err as Error).message
    });
    return '';
  }

  try {
    images.forEach((img, idx) => {
      if (!img) return;
      const match = img.match(DATA_URL_PATTERN);
      if (!match) return;
      const ext = match[1].split('/')[1];
      const buf = Buffer.from(match[2], 'base64');
      const filename = `${article}-${idx + 1}.${ext}`;
      const destination = path.join(targetDir, filename);
      fs.writeFileSync(destination, buf);
      if (!firstImage) {
        firstImage = path.posix.join('/media', itemUUID, filename);
      }
    });
  } catch (err) {
    logger.error('Failed to persist item images', {
      itemUUID,
      error: (err as Error).message
    });
  }

  return firstImage;
}
