import { serializeLangtextForExport } from '../backend/lib/langtext';

describe('serializeLangtextForExport', () => {
  const baseContext = {
    logger: console,
    context: 'test',
    artikelNummer: 'TEST-ART-1',
    itemUUID: 'TEST-ITEM-1'
  } as const;

  it('serializes Langtext payloads to JSON when configured', () => {
    const payload = { de: 'Beschreibung', en: 'Description' };
    const result = serializeLangtextForExport(payload, 'json', baseContext);
    expect(result).toBe('{"de":"Beschreibung","en":"Description"}');
  });

  it('serializes Langtext payloads to markdown bullet lists', () => {
    const payload = { Specs: 'Robust', Features: 'Waterproof\nShockproof' };
    const result = serializeLangtextForExport(payload, 'markdown', baseContext);
    expect(result).toBe('- **Specs** Robust\n- **Features** Waterproof Shockproof');
  });

  it('serializes Langtext payloads to HTML lists', () => {
    const payload = { Specs: 'Robust', Features: 'Waterproof\nShockproof' };
    const result = serializeLangtextForExport(payload, 'html', baseContext);
    expect(result).toBe('<ul><li><strong>Specs</strong> Robust</li><li><strong>Features</strong> Waterproof<br />Shockproof</li></ul>');
  });

  it('handles legacy text inputs for markdown serialization', () => {
    const value = 'Line 1\nLine 2';
    const result = serializeLangtextForExport(value, 'markdown', baseContext);
    expect(result).toBe('Line 1\nLine 2');
  });
});
