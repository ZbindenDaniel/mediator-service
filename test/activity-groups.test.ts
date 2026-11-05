import { EventLogLevel } from '../models';
import type { EventLog } from '../models';
import { buildActivityRows, formatDayLabel } from '../frontend/src/utils/activityGroups';

let nextId = 100;
function ev(event: string, createdAt: string, actor = 'sync'): EventLog {
  nextId -= 1;
  return { Id: nextId, CreatedAt: createdAt, Actor: actor, EntityType: 'Item', EntityId: `I-${nextId}`, Event: event, Level: EventLogLevel.Information };
}

const NOW = new Date('2026-11-04T15:00:00');

describe('buildActivityRows', () => {
  it('folds 3+ consecutive same-event/same-actor rows into one burst', () => {
    const rows = buildActivityRows([
      ev('Moved', '2026-11-04T14:05:00'),
      ev('Moved', '2026-11-04T14:04:00'),
      ev('Moved', '2026-11-04T14:03:00'),
      ev('Edit', '2026-11-04T14:00:00')
    ], NOW);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'burst', 'event']);
    expect(rows[0]).toEqual(expect.objectContaining({ label: 'Heute' }));
    expect(rows[1].kind === 'burst' && rows[1].events).toHaveLength(3);
  });

  it('keeps pairs as individual rows and splits on actor change or a long gap', () => {
    const rows = buildActivityRows([
      ev('Moved', '2026-11-04T14:05:00', 'anna'),
      ev('Moved', '2026-11-04T14:04:00', 'anna'),
      ev('Moved', '2026-11-04T14:03:00', 'ben'),
      ev('Moved', '2026-11-04T13:00:00', 'ben')
    ], NOW);
    expect(rows.filter((r) => r.kind === 'event')).toHaveLength(4);
    expect(rows.some((r) => r.kind === 'burst')).toBe(false);
  });

  it('starts a new day header and never folds across days', () => {
    const rows = buildActivityRows([
      ev('Moved', '2026-11-04T00:02:00'),
      ev('Moved', '2026-11-04T00:01:00'),
      ev('Moved', '2026-11-03T23:59:00')
    ], NOW);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'event', 'event', 'day', 'event']);
    expect(rows[3]).toEqual(expect.objectContaining({ label: 'Gestern' }));
  });
});

describe('formatDayLabel', () => {
  it('uses a full date beyond yesterday', () => {
    expect(formatDayLabel(new Date('2026-11-01T10:00:00'), NOW)).toMatch(/01\.11\.2026/);
  });
});
