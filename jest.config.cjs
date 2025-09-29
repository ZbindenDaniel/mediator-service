module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/frontend/src/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@testing-library/react$': '<rootDir>/frontend/test-utils/rtl.tsx'
  },
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};
