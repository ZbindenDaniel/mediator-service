// Union listing across a fallback chain (serialNumber + macAddress), exercised against a real
// temp mount so listFilesInAltDocDirectory reads actual folders.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildExternalDocSummary, resolveExternalDocFileForServe } from '../lib/external-docs';
import type { AltDocDirectoryConfig } from '../config';
import type { AltDocResolutionContext } from '../lib/alt-doc-resolver';

let mount: string;

const makeConfig = (overrides: Partial<AltDocDirectoryConfig> = {}): AltDocDirectoryConfig => ({
  name: 'wipe-reports',
  mountPath: mount,
  identifierType: 'serialNumber',
  identifierTypes: ['serialNumber', 'macAddress'],
  normalize: 'uppercase',
  docType: 'Löschprotokoll',
  writable: true,
  deletable: false,
  ...overrides
});

const makeCtx = (overrides: Partial<AltDocResolutionContext> = {}): AltDocResolutionContext => ({
  itemUUID: 'I-001234-0001',
  ean: null,
  serialNumber: null,
  macAddress: null,
  artikelNummer: null,
  ...overrides
});

beforeAll(() => {
  mount = fs.mkdtempSync(path.join(os.tmpdir(), 'wipe-reports-'));
  // Per-drive cert under the serial folder + machine-level report under the canonical MAC folder.
  fs.mkdirSync(path.join(mount, 'ST940814AS'), { recursive: true });
  fs.writeFileSync(path.join(mount, 'ST940814AS', 'wipe-certificate-sda.pdf'), 'x');
  fs.mkdirSync(path.join(mount, '40167EAA9E6B'), { recursive: true });
  fs.writeFileSync(path.join(mount, '40167EAA9E6B', 'wipe-log.txt'), 'y');
});

afterAll(() => {
  fs.rmSync(mount, { recursive: true, force: true });
});

describe('buildExternalDocSummary union', () => {
  it('serial-less machine surfaces its MAC-keyed files (primary = macAddress)', () => {
    const summary = buildExternalDocSummary(makeConfig(), makeCtx({ macAddress: '40:16:7e:aa:9e:6b' }), 'MACHINE');
    expect(summary.available).toBe(true);
    expect(summary.identifierType).toBe('macAddress');
    expect(summary.identifierValue).toBe('40167EAA9E6B');
    expect(summary.files.map(f => f.fileName)).toEqual(['wipe-log.txt']);
    expect(summary.writable).toBe(true);
  });

  it('machine with both identities unions serial + MAC files (serial header preferred)', () => {
    const summary = buildExternalDocSummary(
      makeConfig(),
      makeCtx({ serialNumber: 'ST940814AS', macAddress: '40:16:7e:aa:9e:6b' }),
      'MACHINE'
    );
    expect(summary.identifierType).toBe('serialNumber');
    expect(summary.fileCount).toBe(2);
    expect(summary.files.map(f => f.fileName).sort()).toEqual(['wipe-certificate-sda.pdf', 'wipe-log.txt']);
  });

  it('reports identifier_not_set when the item has neither identifier', () => {
    const summary = buildExternalDocSummary(makeConfig(), makeCtx(), 'MACHINE');
    expect(summary.available).toBe(false);
    expect(summary.reason).toBe('identifier_not_set');
  });

  it('forceReadOnly strips write/delete affordances', () => {
    const summary = buildExternalDocSummary(makeConfig(), makeCtx({ serialNumber: 'ST940814AS' }), 'MACHINE', { forceReadOnly: true });
    expect(summary.writable).toBe(false);
    expect(summary.deletable).toBe(false);
  });
});

describe('resolveExternalDocFileForServe', () => {
  it('finds a file living in the MAC folder for a serial-less machine', () => {
    const r = resolveExternalDocFileForServe(makeConfig(), makeCtx({ macAddress: '40:16:7e:aa:9e:6b' }), 'wipe-log.txt');
    expect(r).not.toBeNull();
    expect(r!.identifierType).toBe('macAddress');
  });

  it('finds a serial-folder file when the item has both identities', () => {
    const r = resolveExternalDocFileForServe(
      makeConfig(),
      makeCtx({ serialNumber: 'ST940814AS', macAddress: '40:16:7e:aa:9e:6b' }),
      'wipe-certificate-sda.pdf'
    );
    expect(r).not.toBeNull();
    expect(r!.identifierType).toBe('serialNumber');
  });

  it('returns null for an unknown file', () => {
    const r = resolveExternalDocFileForServe(makeConfig(), makeCtx({ serialNumber: 'ST940814AS' }), 'nope.txt');
    expect(r).toBeNull();
  });
});
