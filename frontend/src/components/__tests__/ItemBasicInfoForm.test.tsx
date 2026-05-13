/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ItemBasicInfoForm } from '../ItemBasicInfoForm';
import { ItemEinheit } from '../../../../models';

function getInputByRowLabel(container: HTMLElement, labelText: string): HTMLInputElement {
  const rows = Array.from(container.querySelectorAll('.row'));
  const row = rows.find((candidate) => candidate.querySelector('label')?.textContent?.trim() === labelText);
  if (!row) {
    throw new Error(`Row with label "${labelText}" not found`);
  }
  const input = row.querySelector('input');
  if (!input) {
    throw new Error(`Input with label "${labelText}" not found`);
  }
  return input as HTMLInputElement;
}

function getSelectByRowLabel(container: HTMLElement, labelText: string): HTMLSelectElement {
  const rows = Array.from(container.querySelectorAll('.row'));
  const row = rows.find((candidate) => candidate.querySelector('label')?.textContent?.trim() === labelText);
  if (!row) throw new Error(`Row with label "${labelText}" not found`);
  const select = row.querySelector('select');
  if (!select) throw new Error(`Select with label "${labelText}" not found`);
  return select as HTMLSelectElement;
}

const BASE_VALUES = { Artikelbeschreibung: 'Test Item', Auf_Lager: 1, Einheit: ItemEinheit.Stk };

describe('ItemBasicInfoForm', () => {
  it('submits entered optional dimensions/weight values via onSubmit payload', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    fireEvent.change(getInputByRowLabel(container, 'Länge (mm)'), { target: { value: '120' } });
    fireEvent.change(getInputByRowLabel(container, 'Breite (mm)'), { target: { value: '45' } });
    fireEvent.change(getInputByRowLabel(container, 'Höhe (mm)'), { target: { value: '78' } });
    fireEvent.change(getInputByRowLabel(container, 'Gewicht (kg)'), { target: { value: '1.25' } });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        Länge_mm: 120,
        Breite_mm: 45,
        Höhe_mm: 78,
        Gewicht_kg: 1.25
      })
    );
  });

  it('keeps optional dimension/weight fields nullable when left blank and does not coerce to 0', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    fireEvent.change(getInputByRowLabel(container, 'Länge (mm)'), { target: { value: '300' } });
    fireEvent.change(getInputByRowLabel(container, 'Länge (mm)'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.Länge_mm).toBeUndefined();
    expect(payload.Länge_mm).not.toBe(0);
  });

  it('clears optional numeric value to undefined when input is emptied after being set', () => {
    // type="number" inputs coerce invalid strings to '' in jsdom, so the NaN warn path
    // is not reachable via fireEvent. Test the empty-string clearing branch instead.
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    const weightInput = getInputByRowLabel(container, 'Gewicht (kg)');
    fireEvent.change(weightInput, { target: { value: '1.5' } });
    fireEvent.change(weightInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.Gewicht_kg).toBeUndefined();
    expect(payload.Gewicht_kg).not.toBe(0);
  });

  it('locks Anzahl to 1 and makes it readOnly when SerialNumber is entered', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    fireEvent.change(getInputByRowLabel(container, 'Seriennummer'), { target: { value: 'SN-001' } });

    const anzahlInput = getInputByRowLabel(container, 'Anzahl*');
    expect(anzahlInput.value).toBe('1');
    expect(anzahlInput.readOnly).toBe(true);
  });

  it('locks Anzahl to 1 and makes it readOnly when MacAddress is entered', () => {
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={jest.fn()} />
    );

    fireEvent.change(getInputByRowLabel(container, 'MAC-Adresse'), { target: { value: 'AA:BB:CC:DD:EE:FF' } });

    const anzahlInput = getInputByRowLabel(container, 'Anzahl*');
    expect(anzahlInput.value).toBe('1');
    expect(anzahlInput.readOnly).toBe(true);
  });

  it('clamps Auf_Lager to 1 in submit payload when SerialNumber is set', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={{ ...BASE_VALUES, Auf_Lager: 5 }} onSubmit={onSubmit} />
    );

    fireEvent.change(getInputByRowLabel(container, 'Seriennummer'), { target: { value: 'SN-X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.Auf_Lager).toBe(1);
  });

  it('allows editing Anzahl freely when no identifier is set', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    const anzahlInput = getInputByRowLabel(container, 'Anzahl*');
    expect(anzahlInput.readOnly).toBe(false);

    fireEvent.change(anzahlInput, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ Auf_Lager: 3 }));
  });

  it('renders Seriennummer and MAC-Adresse fields even when Einheit is Menge (fields visible but values cleared on switch)', () => {
    // ItemBasicInfoForm always shows SN/MAC inputs; it clears their values when switching
    // to Menge but does not unmount the fields. EditInstanceCard hides them instead.
    const { container } = render(
      <ItemBasicInfoForm
        initialValues={{ ...BASE_VALUES, Einheit: ItemEinheit.Menge }}
        onSubmit={jest.fn()}
      />
    );

    const rows = Array.from(container.querySelectorAll('.row'));
    const labels = rows.map((r) => r.querySelector('label')?.textContent?.trim());
    expect(labels).toContain('Seriennummer');
    expect(labels).toContain('MAC-Adresse');
  });

  it('clears SerialNumber and MacAddress when switching Einheit to Menge', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    fireEvent.change(getInputByRowLabel(container, 'Seriennummer'), { target: { value: 'SN-001' } });
    fireEvent.change(getInputByRowLabel(container, 'MAC-Adresse'), { target: { value: 'AA:BB:CC' } });

    const einheitSelect = getSelectByRowLabel(container, 'Einheit*');
    fireEvent.change(einheitSelect, { target: { value: ItemEinheit.Menge } });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.SerialNumber).toBeNull();
    expect(payload.MacAddress).toBeNull();
  });

  it('includes EAN in the submit payload when entered', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={BASE_VALUES} onSubmit={onSubmit} />
    );

    fireEvent.change(getInputByRowLabel(container, 'EAN'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.EAN).toBe('12345678');
  });

  it('submits EAN as null when field is cleared', () => {
    const onSubmit = jest.fn();
    const { container } = render(
      <ItemBasicInfoForm initialValues={{ ...BASE_VALUES, EAN: '12345678' } as any} onSubmit={onSubmit} />
    );

    const eanInput = getInputByRowLabel(container, 'EAN');
    fireEvent.change(eanInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.EAN).toBeNull();
  });
});
