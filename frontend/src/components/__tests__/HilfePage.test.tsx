/** @jest-environment jsdom */

import React from 'react';
import { readFileSync } from 'fs';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HilfePage from '../HilfePage';

const documents = [
  ['0_Overview', 1],
  ['1_Erste-Schritte', 6],
  ['2_Fehlerbehebung', 0],
  ['3_Drucker-Einrichtung', 6],
  ['4_Ersatzteile-erfassen', 2],
  ['5_CO2-Berechnung', 2],
  ['6_Artikel', 7],
  ['7_Administration', 1],
  ['8_Fundsachen', 0],
  ['9_Aktivitaeten', 3],
  ['10_KI-Cockpit', 6]
] as const;

const loadDocument = (name: string) => readFileSync(`docs/user/${name}.md`, 'utf8');

async function showHelp(markdown: string) {
  global.fetch = jest.fn(async () => ({
    json: async () => [{ name: 'test', title: 'Testdokument' }],
    text: async () => markdown
  })) as unknown as typeof fetch;
  const view = render(
    <MemoryRouter initialEntries={['/hilfe?doc=test']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HilfePage />
    </MemoryRouter>
  );
  await screen.findByRole('heading', { level: 1, name: markdown.split('\n')[0].slice(2) });
  return view.container.querySelector('article')!;
}

describe('HilfePage document formatting', () => {
  const originalFetch = global.fetch;

  beforeEach(() => localStorage.setItem('username', 'Test'));
  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  it.each(documents)('renders the existing %s help document', async (name, tables) => {
    const article = await showHelp(loadDocument(name));

    expect(article.querySelectorAll('table')).toHaveLength(tables);
    for (const item of article.querySelectorAll('li')) {
      expect(['UL', 'OL']).toContain(item.parentElement?.tagName);
    }
    for (const paragraph of article.querySelectorAll('p')) {
      expect(paragraph.textContent).not.toMatch(/^(\||>\s|\d+\.\s|```)/);
    }
    expect(article.querySelector('br')).toBeNull();
  });

  it('keeps printer substeps, nested lists, and indented commands inside their numbered steps', async () => {
    const article = await showHelp(loadDocument('3_Drucker-Einrichtung'));
    const download = within(article).getByRole('link', { name: 'support.brother.com' }).closest('li')!;

    expect(download.parentElement?.tagName).toBe('OL');
    expect(download.querySelectorAll('ul > li')).toHaveLength(2);

    const command = Array.from(article.querySelectorAll('pre code')).find(
      (code) => code.textContent === 'docker compose up --build cups'
    )!;
    expect(command.closest('li')?.textContent).toContain('CUPS-Container neu bauen:');
    expect(article.querySelector('a code')?.textContent).toBe('docs/detailed/printer-server-setup.md');
  });

  it('formats checklists and quotes while leaving code and HTML examples as text', async () => {
    const article = await showHelp([
      '# Formatbeispiel', '', '- [ ] Noch offen', '- [x] Erledigt', '',
      '> **Hinweis:** Text', '> geht *weiter*.', '',
      '```', '1. Kein Listeneintrag', '<script>alert(1)</script>', '```'
    ].join('\n'));

    expect((within(article).getByRole('checkbox', { name: 'Noch offen' }) as HTMLInputElement).checked).toBe(false);
    expect((within(article).getByRole('checkbox', { name: 'Erledigt' }) as HTMLInputElement).checked).toBe(true);
    expect(article.querySelector('blockquote p')?.textContent).toBe('Hinweis: Text geht weiter.');
    expect(article.querySelector('blockquote em')?.textContent).toBe('weiter');
    expect(article.querySelector('pre code')?.textContent).toContain('1. Kein Listeneintrag\n<script>alert(1)</script>');
    expect(article.querySelector('script')).toBeNull();
  });
});
