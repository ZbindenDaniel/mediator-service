import React from 'react';

// Escape a string so it can be embedded literally into a RegExp.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tokenize the search input into words worth highlighting. Single characters are
// dropped because highlighting every "a"/"e" adds noise rather than helping spot a match.
function extractTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 2)
    )
  );
}

/**
 * Wrap every occurrence of any word from `query` inside `text` in a highlight
 * marker so operators can spot which parts of a candidate match their input.
 */
export function highlightMatches(text: string | null | undefined, query: string | null | undefined): React.ReactNode {
  const safeText = text ?? '';
  const terms = extractTerms(query ?? '');
  if (!safeText || terms.length === 0) {
    return safeText;
  }

  // Longest terms first so a longer phrase wins over a shorter substring of it.
  const pattern = terms
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = safeText.split(regex);

  return parts.map((part, index) =>
    // Odd indices are the captured matches from the split regex.
    index % 2 === 1 ? (
      <mark key={index} className="suggestion-highlight">
        {part}
      </mark>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    )
  );
}
