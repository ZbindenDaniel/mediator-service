/** @jest-environment jsdom */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const PRESENCE = ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut'];

jest.mock('../../lib/contractsApi', () => ({
  fetchQualityContract: jest.fn(async (key: string | number) => {
    if (key === 'general') return { version: 1, scale: { Gut: 0.7, Defekt: 0 }, questions: [] };
    if (key === 201) return { version: 1, questions: [{ id: 'boots', type: 'select', question: 'Startet das Gerät?', values: ['Ja', 'Nein'], states: { Ja: 1, Nein: 0 }, weight: 4 }] };
    if (key === 2109) return { version: 1, questions: [{ id: 'part_condition', type: 'select', question: 'Zustand des Teils?', values: ['Gut', 'Defekt'], weight: 3 }] };
    return null;
  }),
  fetchAssemblyContract: jest.fn(async (code: number) =>
    code === 201
      ? { version: 1, subCategory: 201, parts: [{ key: 'webcam', label: 'Webcam', targetSubcategory: 2109, weight: 3, question: { id: 'part_webcam', type: 'select', question: 'Webcam?', values: PRESENCE } }] }
      : null),
}));

jest.mock('../../lib/user', () => ({ ensureUser: jest.fn(async () => 'alice') }));

import QualityReviewModal from '../QualityReviewModal';

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  window.localStorage.clear();
  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url.endsWith('/spare-parts/component')) return json({ itemUUID: 'C-new', subCategory: 2109 }, 201);
    if (url.endsWith('/spare-parts')) return json({ spareParts: [] });
    if (url.endsWith('/quality-review') && method === 'POST') return json({ id: 1 });
    if (url.endsWith('/quality-review')) return json({ responses: {} });
    return json({}, 404);
  });
});

function selectIn(label: string, value: string) {
  // Labels are not linked to their selects; pick the visible select whose row carries the label text.
  const row = screen.getByText(label).closest('.row') as HTMLElement;
  fireEvent.change(row.querySelector('select')!, { target: { value } });
}

describe('QualityReviewModal nested assessment', () => {
  it('opens a part, creates it lazily on save, assesses it and returns to the device', async () => {
    const onDone = jest.fn();
    render(<QualityReviewModal itemId="L1" subCategory={201} itemLabel="ThinkPad T480" onDone={onDone} onCancel={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bewerten →' }));
    expect(await screen.findByText('Qualitätsbewertung: Webcam')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ThinkPad T480' })).toBeTruthy(); // breadcrumb back to the device
    // Opening does not create anything yet.
    expect(calls.some((c) => c.url.endsWith('/spare-parts/component'))).toBe(false);

    selectIn('Zustand des Teils?', 'Gut');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speichern & zurück' })); });

    await waitFor(() => expect(calls.some((c) => c.url === '/api/items/C-new/quality-review' && c.method === 'POST')).toBe(true));
    const create = calls.find((c) => c.url.endsWith('/spare-parts/component'))!;
    expect(create.url).toBe('/api/items/L1/spare-parts/component');
    expect(create.body).toEqual({ actor: 'alice', slotKey: 'webcam' });
    const review = calls.find((c) => c.url === '/api/items/C-new/quality-review' && c.method === 'POST')!;
    expect(review.body.answers).toEqual({ part_condition: 'Gut' });

    // Back on the device, which reloads its parts' ranges and kept its own answer ("Vorhanden" set on open).
    await waitFor(() => expect(screen.queryByText('Qualitätsbewertung: Webcam')).toBeNull());
    expect(calls.filter((c) => c.url === '/api/items/L1/spare-parts').length).toBeGreaterThanOrEqual(2);
    const webcamRow = screen.getByText('Webcam?').closest('.row') as HTMLElement;
    expect((webcamRow.querySelector('select') as HTMLSelectElement).value).toBe('Vorhanden');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('"Verwerfen & zurück" leaves no item behind', async () => {
    render(<QualityReviewModal itemId="L1" subCategory={201} onDone={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bewerten →' }));
    await screen.findByText('Qualitätsbewertung: Webcam');
    selectIn('Zustand des Teils?', 'Defekt');
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen & zurück' }));
    await waitFor(() => expect(screen.queryByText('Qualitätsbewertung: Webcam')).toBeNull());
    expect(calls.some((c) => c.url.endsWith('/spare-parts/component'))).toBe(false);
    expect(window.localStorage.getItem('quality-draft:L1>webcam')).toBeNull();
  });

  it('mirrors unsaved answers to localStorage and restores them on reopen', async () => {
    const first = render(<QualityReviewModal itemId="L1" subCategory={201} onDone={jest.fn()} onCancel={jest.fn()} />);
    await screen.findByText('Startet das Gerät?');
    selectIn('Startet das Gerät?', 'Nein');
    await waitFor(() => expect(window.localStorage.getItem('quality-draft:L1')).toContain('"boots":"Nein"'));
    first.unmount();

    render(<QualityReviewModal itemId="L1" subCategory={201} onDone={jest.fn()} onCancel={jest.fn()} initialAnswers={{ boots: 'Ja' }} />);
    expect(await screen.findByText(/Entwurf wiederhergestellt/)).toBeTruthy();
    const row = screen.getByText('Startet das Gerät?').closest('.row') as HTMLElement;
    expect((row.querySelector('select') as HTMLSelectElement).value).toBe('Nein');
  });
});
