
// type TestAgenticEnv = typeof globalThis & { AGENTIC_API_BASE?: string };

// describe('resolveAgenticApiBase helper', () => {
//   const globalScope = globalThis as TestAgenticEnv;
//   const originalGlobalAgenticApiBase = globalScope.AGENTIC_API_BASE;
//   const originalEnvAgenticApiBase = process.env.AGENTIC_API_BASE;

//   beforeEach(() => {
//     delete globalScope.AGENTIC_API_BASE;
//     delete process.env.AGENTIC_API_BASE;
//   });

//   afterAll(() => {
//     if (typeof originalGlobalAgenticApiBase === 'undefined') {
//       delete globalScope.AGENTIC_API_BASE;
//     } else {
//       globalScope.AGENTIC_API_BASE = originalGlobalAgenticApiBase;
//     }

//     if (typeof originalEnvAgenticApiBase === 'undefined') {
//       delete process.env.AGENTIC_API_BASE;
//     } else {
//       process.env.AGENTIC_API_BASE = originalEnvAgenticApiBase;
//     }
//   });

//   it('normalizes the base URL from the global scope', () => {
//     globalScope.AGENTIC_API_BASE = '  https://example.test/base///  ';

//     expect(resolveAgenticApiBase()).toBe('https://example.test/base');
//   });

//   it('falls back to process.env when the global scope is missing the value', () => {
//     process.env.AGENTIC_API_BASE = ' http://localhost:4321/ ';

//     expect(resolveAgenticApiBase()).toBe('http://localhost:4321');
//   });

//   it('returns null when neither the global scope nor the environment provide a usable value', () => {
//     expect(resolveAgenticApiBase()).toBeNull();

//     process.env.AGENTIC_API_BASE = '   ';
//     expect(resolveAgenticApiBase()).toBeNull();
//   });
// });
