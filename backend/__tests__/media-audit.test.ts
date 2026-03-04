import { emitMediaAudit } from '../lib/media-audit';

describe('media audit emitter', () => {
  it('emits strict success event shape', () => {
    const logger = { info: jest.fn() };

    const event = emitMediaAudit(
      {
        action: 'write',
        scope: 'import',
        identifier: { artikelNummer: '000123', itemUUID: 'ITEM-1' },
        path: '/tmp/media/000123/000123-1.jpg',
        root: '/tmp/media',
        outcome: 'success',
        reason: 'archive-extract',
      },
      logger
    );

    expect(event).toEqual({
      action: 'write',
      scope: 'import',
      identifier: { artikelNummer: '000123', itemUUID: 'ITEM-1' },
      path: '/tmp/media/000123/000123-1.jpg',
      root: '/tmp/media',
      outcome: 'success',
      reason: 'archive-extract',
      error: null,
    });
    expect(logger.info).toHaveBeenCalledWith('[media-audit]', event);
  });

  it('normalizes blocked-path event with default identifier and error', () => {
    const logger = { info: jest.fn() };

    const event = emitMediaAudit(
      {
        action: 'delete',
        scope: 'item',
        path: '../outside-root.jpg',
        root: '/var/media',
        outcome: 'blocked',
        reason: 'unsafe-relative-path',
        error: new Error('outside root'),
      },
      logger
    );

    expect(event).toEqual({
      action: 'delete',
      scope: 'item',
      identifier: { artikelNummer: null, itemUUID: null },
      path: '../outside-root.jpg',
      root: '/var/media',
      outcome: 'blocked',
      reason: 'unsafe-relative-path',
      error: 'outside root',
    });
    expect(logger.info).toHaveBeenCalledWith('[media-audit]', event);
  });
});
