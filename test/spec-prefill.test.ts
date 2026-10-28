import { missingRequiredSpecs, prefillSpecFields } from '../frontend/src/lib/specPrefill';
import type { SpecContract } from '../models/spec-contract';

const contract = { version: 1, subCategory: 201, fields: [
  { key: 'Prozessor', required: true },
  { key: 'Displaygrösse', required: true },
  { key: 'Farbe', required: false },
] } as unknown as SpecContract;

describe('article specs at creation', () => {
  it('adds an empty entry per contract field and keeps what is there', () => {
    expect(JSON.parse(prefillSpecFields(undefined, contract) as string)).toEqual({ Prozessor: '', Displaygrösse: '', Farbe: '' });
    expect(JSON.parse(prefillSpecFields('{"Prozessor":"i5-8350U"}', contract) as string)).toMatchObject({ Prozessor: 'i5-8350U', Farbe: '' });
  });

  it('leaves legacy free-text Langtext alone', () => {
    expect(prefillSpecFields('Gutes Gerät', contract)).toBe('Gutes Gerät');
  });

  it('lists empty required fields only', () => {
    expect(missingRequiredSpecs('{"Prozessor":"i5","Displaygrösse":" ","Farbe":""}', contract)).toEqual(['Displaygrösse']);
  });
});
