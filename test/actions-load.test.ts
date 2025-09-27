export {};

const { loadActions } = require('../backend/actions');

const removedKeys = ['print-label', 'edit', 'shop', 'kivi', 'export-items'];

test('loadActions excludes deprecated actions', () => {
  let actions;
  try {
    actions = loadActions();
  } catch (err) {
    console.error('loadActions threw unexpectedly', err);
    throw err;
  }
  const keys = actions.map((a: { key: string }) => a.key);
  removedKeys.forEach((key) => {
    const present = keys.includes(key);
    if (present) {
      console.error('Unexpected action key loaded', key, keys);
    }
    expect(present).toBe(false);
  });
});
