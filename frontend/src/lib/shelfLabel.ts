import { shelfLocations } from '../data/shelfLocations';
import { logError, logger } from '../utils/logger';

// TODO(agent): Validate the new shelf label formatter output against live shelf IDs.
export function formatShelfLabel(shelfId?: string | null): string | null {
  let normalizedShelfId = '';

  try {
    normalizedShelfId = shelfId?.trim() ?? '';
  } catch (error) {
    logError('Failed to normalize shelf id for formatted label', error, { shelfId });
  }

  if (!normalizedShelfId) {
    return null;
  }

  try {
    const segments = normalizedShelfId.split('-');
    if (segments.length < 3) {
      logger.warn('Invalid shelf ID format while formatting shelf label', {
        shelfId: normalizedShelfId,
        segments,
      });
      return null;
    }

    const locationSegment = segments[1];
    const floorSegment = segments[2];

    if (!locationSegment || !floorSegment) {
      logger.warn('Shelf ID missing location or floor segment', {
        shelfId: normalizedShelfId,
        locationSegment,
        floorSegment,
      });
      return null;
    }

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

    const locationLabel = locationEntry?.label?.trim() || locationSegment;

    if (!locationEntry?.label) {
      logger.warn('Shelf location label missing for shelf display', {
        shelfId: normalizedShelfId,
        locationSegment,
      });
    }

    return `${locationLabel} · Etage ${floorSegment}`;
  } catch (error) {
    logError('Failed to format shelf label', error, {
      shelfId: normalizedShelfId,
    });
    return null;
  }
}
