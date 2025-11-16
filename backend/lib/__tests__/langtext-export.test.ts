import { formatLangtextForExport, isLangtextExportFormat } from '../langtext';

describe('formatLangtextForExport', () => {
  it('serializes payloads as JSON when requested', () => {
    const payload = { de: 'Beschreibung', en: 'Description' };
    const result = formatLangtextForExport(payload, 'json');
    expect(result).toEqual(JSON.stringify(payload));
  });

  it('formats payloads as markdown bullet lists', () => {
    const payload = { de: 'Beschreibung', en: 'Description' };
    const result = formatLangtextForExport(payload, 'markdown');
    expect(result).toEqual('- **de**: Beschreibung\n- **en**: Description');
  });

  it('formats payloads as escaped HTML paragraphs', () => {
    const payload = { en: 'Description & details', note: '<b>Markup</b>' };
    const result = formatLangtextForExport(payload, 'html');
    expect(result).toEqual(
      '<p><strong>en:</strong> Description &amp; details</p><p><strong>note:</strong> &lt;b&gt;Markup&lt;/b&gt;</p>'
    );
  });

  it('returns trimmed legacy text for markdown export', () => {
    const result = formatLangtextForExport('  legacy text  ', 'markdown');
    expect(result).toEqual('legacy text');
  });

  it('wraps and escapes legacy text for HTML export', () => {
    const result = formatLangtextForExport('  <b>legacy</b>  ', 'html');
    expect(result).toEqual('<p>&lt;b&gt;legacy&lt;/b&gt;</p>');
  });

  it('preserves keys with blank values in HTML export', () => {
    const result = formatLangtextForExport({ empty: '   ' }, 'html');
    expect(result).toEqual('<p><strong>empty</strong></p>');
  });

  it('returns an empty string when key and value are whitespace', () => {
    const result = formatLangtextForExport({ '   ': '   ' }, 'html');
    expect(result).toEqual('');
  });
});

describe('isLangtextExportFormat', () => {
  it('validates supported export formats', () => {
    expect(isLangtextExportFormat('json')).toBe(true);
    expect(isLangtextExportFormat('markdown')).toBe(true);
    expect(isLangtextExportFormat('html')).toBe(true);
    expect(isLangtextExportFormat('txt')).toBe(false);
    expect(isLangtextExportFormat(null)).toBe(false);
  });
});
