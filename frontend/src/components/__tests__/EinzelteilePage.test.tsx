/** @jest-environment jsdom */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const PRESENCE = ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut'];
const presence = (id: string) => ({ id, type: 'select', question: `${id}?`, values: PRESENCE });

jest.mock('../../lib/contractsApi', () => ({
  fetchQualityContract: jest.fn(async (key: string | number) => {
    if (key === 'general') return { version: 1, scale: { Gut: 0.7, Defekt: 0 }, questions: [] };
    if (key === 2132) return { version: 1, questions: [{ id: 'part_condition', type: 'select', question: 'Zustand des Teils?', values: ['Gut', 'Defekt'], weight: 3 }] };
    return null;
  }),
  fetchAssemblyContract: jest.fn(async () => null),
}));
jest.mock('../../lib/user', () => ({ ensureUser: jest.fn(async () => 'alice'), getUser: jest.fn(() => 'alice') }));

import EinzelteilePage from '../einzelteile/EinzelteilePage';

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let tree: any;

function laptop() {
  return {
    itemUUID: 'L1', artikelNummer: '104523', label: 'ThinkPad T480', subCategory: 201, boxId: null,
    assessed: true, scoreMin: 0.7, scoreMax: 0.8, quality: 4,
    assembly: {
      steps: [{ key: 'bottom', label: 'Akku & Bodenabdeckung' }],
      slots: [
        { part: { key: 'battery', label: 'Akku', targetSubcategory: 2132, weight: 5, step: 'bottom', question: presence('part_battery') }, answer: null, specAnswer: null, items: [] },
        { part: { key: 'drive_2', label: '2. Laufwerk', targetSubcategory: 2130, weight: 2, step: 'bottom', default: 'Nicht vorgesehen', question: presence('part_drive_2') }, answer: null, specAnswer: null, items: [] },
      ],
    },
  };
}

beforeEach(() => {
  calls = [];
  tree = laptop();
  window.localStorage.clear();
  window.matchMedia = jest.fn(() => ({ matches: true })) as any;
  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url === '/api/items/L1/parts-tree') return json({ tree });
    if (url === '/api/items/L1') return json({ permissions: { canEditItem: true } });
    if (url.endsWith('/spare-parts/component')) return json({ itemUUID: 'C-104523-2132-0001', subCategory: 2132 }, 201);
    if (url.endsWith('/quality-review/answers')) return json({ id: 1 });
    if (url.endsWith('/quality-review') && method === 'POST') return json({ id: 2 });
    if (url.endsWith('/quality-review')) return json({ responses: {} });
    if (url.endsWith('/spare-parts')) return json({ spareParts: [] });
    return json({}, 404);
  });
});

function renderPage(path = '/items/L1/einzelteile') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/items/:itemId/einzelteile" element={<EinzelteilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Einzelteile page', () => {
  it('shows work steps, marks an unconfirmed default, and saves presence per click', async () => {
    renderPage();
    expect(await screen.findByText('1 · Akku & Bodenabdeckung')).toBeTruthy();
    // The default counts as answered for progress (1 of 2) and is shown as not yet confirmed.
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(document.querySelector('.parts-tree__chip--default')?.textContent).toBe('– n. v.');

    const batteryChips = screen.getByRole('group', { name: 'part_battery?' });
    await act(async () => { fireEvent.click(batteryChips.querySelector('button:nth-child(2)')!); });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/items/L1/quality-review/answers');
    expect(patch.body).toEqual({ reviewed_by: 'alice', answers: { part_battery: 'Nicht vorhanden' } });
  });

  it('assessing a not yet catalogued part creates it, marks it present and sends only its own answers', async () => {
    renderPage('/items/L1/einzelteile?node=L1~battery');
    expect(await screen.findByText('noch nicht erfasst — wird beim Speichern angelegt')).toBeTruthy();
    const select = (await screen.findByText('Zustand des Teils?')).closest('.row')!.querySelector('select')!;
    fireEvent.change(select, { target: { value: 'Gut' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speichern & nächstes →' })); });

    await waitFor(() => expect(calls.some((c) => c.url === '/api/items/C-104523-2132-0001/quality-review' && c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/spare-parts/component'))!.body).toEqual({ actor: 'alice', slotKey: 'battery' });
    expect(calls.find((c) => c.method === 'PATCH')!.body.answers).toEqual({ part_battery: 'Vorhanden' });
    const review = calls.find((c) => c.url === '/api/items/C-104523-2132-0001/quality-review' && c.method === 'POST')!;
    expect(review.body.answers).toEqual({ part_condition: 'Gut' });
  });
});
