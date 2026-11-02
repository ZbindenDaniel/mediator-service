import { dropInstanceSpecKeys, stripInstalledSizesFromName } from '../../../models/reference-instance-filter';

describe('dropInstanceSpecKeys — bare installed keys out of the reference Langtext', () => {
  it('drops bare installed keys, keeps capability + unrelated keys', () => {
    expect(
      dropInstanceSpecKeys({
        RAM: '8 GB',
        Arbeitsspeicher: '16 GB',
        Speicher: '256 GB',
        Festplatte: '1 TB',
        'RAM-Slots': '2',
        'RAM-Kapazität': '32 GB',
        Speichertyp: 'SSD',
        Prozessor: 'Intel i5'
      })
    ).toEqual({ 'RAM-Slots': '2', 'RAM-Kapazität': '32 GB', Speichertyp: 'SSD', Prozessor: 'Intel i5' });
  });

  it('is case-insensitive on the key and returns a new object', () => {
    const input = { ram: '8 GB', Prozessor: 'i7' };
    const out = dropInstanceSpecKeys(input);
    expect(out).toEqual({ Prozessor: 'i7' });
    expect(input.ram).toBe('8 GB');
  });
});

describe('stripInstalledSizesFromName — installed sizes out of the product name', () => {
  it('removes fitted RAM/storage sizes from a name, leaving it clean', () => {
    expect(stripInstalledSizesFromName('Lenovo ThinkPad X270 8GB RAM 256GB SSD')).toBe('Lenovo ThinkPad X270');
    expect(stripInstalledSizesFromName('Dell Latitude 7490 16 GB RAM, 512 GB NVMe')).toBe('Dell Latitude 7490');
    expect(stripInstalledSizesFromName('HP EliteBook 16GB DDR4')).toBe('HP EliteBook');
    expect(stripInstalledSizesFromName('RAM: 8 GB Lenovo')).toBe('Lenovo');
  });

  it('drops a dangling connector left by a removed trailing phrase', () => {
    expect(stripInstalledSizesFromName('Lenovo ThinkPad X270 mit 8 GB RAM')).toBe('Lenovo ThinkPad X270');
  });

  it('leaves a clean name and bare (size-less) mentions untouched', () => {
    expect(stripInstalledSizesFromName('Lenovo ThinkPad X270')).toBe('Lenovo ThinkPad X270');
    expect(stripInstalledSizesFromName('Laptop mit SSD')).toBe('Laptop mit SSD');
  });
});
