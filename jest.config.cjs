module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/v2/backend/**/*.test.ts', '**/test/**/*.test.ts'],
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};
