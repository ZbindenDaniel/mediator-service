import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { highlightMatches } from '../frontend/src/components/forms/highlightMatches';

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<div>{node}</div>);
}

describe('highlightMatches', () => {
  test('wraps every matching word from the input in a highlight mark', () => {
    const markup = render(highlightMatches('Lenovo ThinkPad T480 Notebook', 'thinkpad notebook'));

    expect(markup).toContain('<mark class="suggestion-highlight">ThinkPad</mark>');
    expect(markup).toContain('<mark class="suggestion-highlight">Notebook</mark>');
    // Unmatched words stay unmarked.
    expect(markup).toContain('Lenovo');
    expect(markup).not.toContain('<mark class="suggestion-highlight">Lenovo</mark>');
  });

  test('matches case-insensitively', () => {
    const markup = render(highlightMatches('HP EliteBook', 'elitebook'));

    expect(markup).toContain('<mark class="suggestion-highlight">EliteBook</mark>');
  });

  test('ignores single-character tokens to avoid noise', () => {
    const markup = render(highlightMatches('a big monitor', 'a monitor'));

    // The single-character "a" must not be highlighted; only "monitor" is.
    expect(markup).not.toContain('<mark class="suggestion-highlight">a</mark>');
    expect(markup).toContain('<mark class="suggestion-highlight">monitor</mark>');
  });

  test('returns plain text when there is no query', () => {
    const markup = render(highlightMatches('Some description', ''));

    expect(markup).not.toContain('<mark');
    expect(markup).toContain('Some description');
  });

  test('treats regex metacharacters in the query as literals', () => {
    const markup = render(highlightMatches('Model (v2) ready', '(v2)'));

    expect(markup).toContain('<mark class="suggestion-highlight">(v2)</mark>');
  });
});
