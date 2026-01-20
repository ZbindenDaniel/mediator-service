import { shelfLocations } from '../data/shelfLocations';
import { logError, logger } from '../utils/logger';

export function getShelfDisplayLabel(shelfId?: string | null, fallbackLabel?: string | null): string | null {
  let normalizedShelfId = '';

  try {
    normalizedShelfId = shelfId?.trim() ?? '';
  } catch (error) {
    logError('Failed to normalize shelf id for display label', error, { shelfId });
  }

  if (!normalizedShelfId) {
    return fallbackLabel?.trim() || null;
  }

  try {
    const segments = normalizedShelfId.split('-');
    if (segments.length < 3) {
      logger.warn('Invalid shelf ID format while deriving shelf display label', {
        shelfId: normalizedShelfId,
        segments,
      });
      return fallbackLabel?.trim() || normalizedShelfId;
    }

    const locationSegment = segments[1];
    const floorSegment = segments[2];
    const locationEntry = shelfLocations.find((location) => location.id === locationSegment);

    if (!locationEntry) {
      logger.warn('Missing shelf location label for shelf display', {
        shelfId: normalizedShelfId,
        locationSegment,
      });
    } else if (!locationEntry.floors.includes(floorSegment)) {
      logger.warn('Shelf floor does not match configured floors', {
        shelfId: normalizedShelfId,
        locationSegment,
        floorSegment,
        floors: locationEntry.floors,
      });
    }

    const locationLabel = locationEntry?.label?.trim()
      || locationSegment
      || fallbackLabel?.trim()
      || normalizedShelfId;

    if (!locationEntry?.label) {
      logger.warn('Shelf location label missing for shelf display', {
        shelfId: normalizedShelfId,
        locationSegment,
      });
    }

    return `${locationLabel} · Etage ${floorSegment}`;
  } catch (error) {
    logError('Failed to derive shelf display label', error, {
      shelfId: normalizedShelfId,
    });
    return fallbackLabel?.trim() || normalizedShelfId;
  }
}
