/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgenticReviewWizard, type AgenticReviewWizardData, type AgenticReviewWizardResult } from '../AgenticReviewWizard';

const BASE_DATA: AgenticReviewWizardData = {
  artikelbeschreibung: 'Altbeschreibung',
  kurzbeschreibung: 'Alt kurz',
  laenge: '',
  breite: '',
  hoehe: '',
  gewicht: '',
  price: '',
  specFields: []
};

function clickButton(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function advanceToSummary() {
  clickButton('Weiter'); // 1 -> 2
  clickButton('Weiter'); // 2 -> 3
  clickButton('Weiter'); // 3 -> 4
  clickButton('Weiter'); // 4 -> 5
  clickButton('Weiter'); // 5 -> summary
}

describe('AgenticReviewWizard', () => {
  it('approve path captures edits, dimensions, price, shop flag and tagged notes', () => {
    const onResolve = jest.fn();
    render(<AgenticReviewWizard data={BASE_DATA} onResolve={onResolve} />);

    // Step 1: edit the description + leave feedback.
    fireEvent.change(document.getElementById('wizard-artikelbeschreibung')!, { target: { value: 'Neuer Name' } });
    fireEvent.change(document.getElementById('wizard-note-beschreibung')!, { target: { value: 'Tippfehler behoben' } });
    clickButton('Weiter'); // -> 2
    clickButton('Weiter'); // -> 3
    clickButton('Weiter'); // -> 4 (Dimensionen)
    fireEvent.change(document.getElementById('wizard-laenge')!, { target: { value: '147' } });
    clickButton('Weiter'); // -> 5 (Preis)
    fireEvent.change(document.getElementById('wizard-preis')!, { target: { value: '199.9' } });
    clickButton('Weiter'); // -> summary

    clickButton('Freigeben'); // summary -> shop (default: in den Shop)
    clickButton('Freigeben & abschliessen');

    expect(onResolve).toHaveBeenCalledTimes(1);
    const result = onResolve.mock.calls[0][0] as AgenticReviewWizardResult;
    expect(result.decision).toBe('approved');
    expect(result.referenceEdits).toEqual({ Artikelbeschreibung: 'Neuer Name', 'Länge_mm': '147' });
    expect(result.reviewPrice).toBe(199.9);
    expect(result.shopArticle).toBe(true);
    expect(result.notes).toContain('Artikelbeschreibung: Tippfehler behoben');
  });

  it('reject path resolves rejected with no shop flag', () => {
    const onResolve = jest.fn();
    render(<AgenticReviewWizard data={BASE_DATA} onResolve={onResolve} />);

    advanceToSummary();
    clickButton('Ablehnen');

    expect(onResolve).toHaveBeenCalledTimes(1);
    const result = onResolve.mock.calls[0][0] as AgenticReviewWizardResult;
    expect(result.decision).toBe('rejected');
    expect(result.shopArticle).toBeNull();
  });

  it('reject folds a before→after correction diff into the notes for the next run', () => {
    const onResolve = jest.fn();
    const data: AgenticReviewWizardData = {
      ...BASE_DATA,
      artikelbeschreibung: 'Lativ X200',
      specFields: [{ key: 'RAM', value: '8GB' }, { key: 'Marketing', value: 'super', removable: true }]
    };
    render(<AgenticReviewWizard data={data} onResolve={onResolve} />);

    fireEvent.change(document.getElementById('wizard-artikelbeschreibung')!, { target: { value: 'Lenovo ThinkPad X200' } });
    fireEvent.change(document.getElementById('wizard-note-beschreibung')!, { target: { value: 'Marke war falsch' } });
    clickButton('Weiter'); // 2
    clickButton('Weiter'); // 3 (Spezifikationen)
    fireEvent.change(document.getElementById('wizard-spec-Marketing')!, { target: { value: '' } }); // remove spec
    clickButton('Weiter'); // 4
    fireEvent.change(document.getElementById('wizard-hoehe')!, { target: { value: '26' } });
    clickButton('Weiter'); // 5
    clickButton('Weiter'); // summary
    clickButton('Ablehnen');

    const result = onResolve.mock.calls[0][0] as AgenticReviewWizardResult;
    expect(result.decision).toBe('rejected');
    expect(result.notes).toContain('Vorherige Reviewer-Korrekturen');
    expect(result.notes).toContain('Artikelbeschreibung: "Lativ X200" → "Lenovo ThinkPad X200"');
    expect(result.notes).toContain('Höhe_mm: (leer) → "26"');
    expect(result.notes).toContain('Spec „Marketing“ entfernt');
    expect(result.notes).toContain('Marke war falsch');
  });

  it('approve does not emit a correction diff (edits are persisted instead)', () => {
    const onResolve = jest.fn();
    render(<AgenticReviewWizard data={BASE_DATA} onResolve={onResolve} />);

    fireEvent.change(document.getElementById('wizard-artikelbeschreibung')!, { target: { value: 'Korrigiert' } });
    advanceToSummary();
    clickButton('Freigeben');
    clickButton('Freigeben & abschliessen');

    const result = onResolve.mock.calls[0][0] as AgenticReviewWizardResult;
    expect(result.decision).toBe('approved');
    expect(result.notes).not.toContain('Vorherige Reviewer-Korrekturen');
    expect(result.referenceEdits.Artikelbeschreibung).toBe('Korrigiert');
  });

  it('Zurück preserves entered values across navigation', () => {
    const onResolve = jest.fn();
    render(<AgenticReviewWizard data={BASE_DATA} onResolve={onResolve} />);

    fireEvent.change(document.getElementById('wizard-artikelbeschreibung')!, { target: { value: 'Zwischenstand' } });
    clickButton('Weiter'); // -> 2
    clickButton('Zurück'); // back to 1
    expect((document.getElementById('wizard-artikelbeschreibung') as HTMLTextAreaElement).value).toBe('Zwischenstand');
  });

  it('cancel (Abbrechen) resolves null', () => {
    const onResolve = jest.fn();
    render(<AgenticReviewWizard data={BASE_DATA} onResolve={onResolve} />);
    clickButton('Abbrechen');
    expect(onResolve).toHaveBeenCalledWith(null);
  });

  it('does not record an unchanged field as an edit', () => {
    const onResolve = jest.fn();
    render(<AgenticReviewWizard data={BASE_DATA} onResolve={onResolve} />);
    advanceToSummary();
    clickButton('Freigeben');
    clickButton('Freigeben & abschliessen');
    const result = onResolve.mock.calls[0][0] as AgenticReviewWizardResult;
    expect(result.referenceEdits).toEqual({});
  });
});
