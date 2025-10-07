describe('custom harness utilities', () => {
  let aliasRan = false;

  afterAll(() => {
    expect(aliasRan).toBe(true);
  });

  it('registers tests through the it alias', () => {
    aliasRan = true;
  });

  it('supports primitive matchers and negation', () => {
    expect(undefined).toBeUndefined();
    expect('value').toBeDefined();
    expect(true).toBeTruthy();
    expect(false).toBeFalsy();
    expect('abc').not.toContain('z');
    expect(1).not.toBe(2);
  });

  it('tracks calls on jest.fn mocks', async () => {
    const mock = jest.fn((value) => value * 2);

    const result = mock(3);
    expect(result).toBe(6);
    expect(mock).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledWith(3);
    expect(mock).not.toHaveBeenCalledWith(5);

    mock.mockResolvedValue('done');
    const resolved = await mock();
    expect(resolved).toBe('done');
  });

  it('spies on existing methods and restores originals', () => {
    const target = {
      value: 0,
      increment(delta) {
        this.value += delta;
        return this.value;
      }
    };

    const spy = jest.spyOn(target, 'increment');
    const first = target.increment(2);
    expect(first).toBe(2);
    expect(spy).toHaveBeenCalledWith(2);

    spy.mockImplementation(function (delta) {
      this.value += delta * 2;
      return this.value;
    });

    const second = target.increment(3);
    expect(second).toBe(8);

    spy.mockRestore();
    const third = target.increment(1);
    expect(third).toBe(9);
    expect(target.increment).not.toBe(spy);
  });
});
