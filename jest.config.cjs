module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/backend/**/*.test.ts',
    '**/v2/backend/**/*.test.ts',
    '**/test/**/*.test.ts'
  ],
};
