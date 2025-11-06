module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.ts',
    '**/backend/actions/__tests__/**/*.test.ts',
    '**/backend/integrations/**/__tests__/**/*.test.ts',
    '**/frontend/src/components/__tests__/**/*.test.tsx',
    '**/scripts/__tests__/**/*.test.ts'
  ],
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};
