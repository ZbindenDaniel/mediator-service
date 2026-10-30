/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FindingsPanel } from '../FindingsPanel';
import type { Finding } from '../../../../models/agentic-findings';

const fixable: Finding = { type: 'missing_required', severity: 'block', field: 'Prozessor', message: 'Pflichtfeld „Prozessor“ fehlt.', ask: 'fix' };
const banned: Finding = { type: 'banned_phrase', severity: 'warn', field: 'Artikelbeschreibung', message: 'Garantie entfernen.', evidence: 'mit einer Garantie von', ask: 'fix' };
const conflict: Finding = { type: 'intake_conflict', severity: 'warn', field: 'RAM', message: 'Konflikt.', ask: 'choose' };

describe('FindingsPanel — L5a per-finding "Beheben"', () => {
  it('renders nothing without findings', () => {
    const { container } = render(<FindingsPanel findings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows no action buttons when onFix is omitted (read-only, e.g. the wizard)', () => {
    render(<FindingsPanel findings={[fixable, banned]} />);
    expect(screen.queryByRole('button', { name: 'Beheben' })).toBeNull();
  });

  it('shows a "Beheben" button only for fix-findings when onFix is provided', () => {
    render(<FindingsPanel findings={[fixable, banned, conflict]} onFix={() => {}} />);
    // two fixable (missing_required + banned_phrase), the choose-conflict gets none
    expect(screen.getAllByRole('button', { name: 'Beheben' })).toHaveLength(2);
  });

  it('calls onFix with the finding when clicked', () => {
    const onFix = jest.fn();
    render(<FindingsPanel findings={[fixable]} onFix={onFix} />);
    fireEvent.click(screen.getByRole('button', { name: 'Beheben' }));
    expect(onFix).toHaveBeenCalledWith(fixable);
  });

  it('disables the buttons while busy', () => {
    render(<FindingsPanel findings={[fixable]} onFix={() => {}} busy />);
    expect((screen.getByRole('button', { name: 'Beheben' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
