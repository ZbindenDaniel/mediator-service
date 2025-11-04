import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRateLimiter } from '../utils/rateLimiter.js';

export async function runRateLimiterTests() {
  const limiter = createRateLimiter({ delayMs: 50 });
  const timestamps = [];

  const tasks = Array.from({ length: 3 }, (_, index) =>
    limiter(async () => {
      const now = performance.now();
      timestamps.push(now);
      return index;
    }, { query: `q-${index}` })
  );

  const results = await Promise.all(tasks);
  assert.deepEqual(results, [0, 1, 2], 'limiter should execute tasks in submission order');
  assert.equal(timestamps.length, 3);

  const gap1 = timestamps[1] - timestamps[0];
  const gap2 = timestamps[2] - timestamps[1];

  assert(gap1 >= 40, `expected first gap >= 40ms but received ${gap1}`);
  assert(gap2 >= 40, `expected second gap >= 40ms but received ${gap2}`);

  // Ensure rejections propagate properly
  const limiterWithError = createRateLimiter({ delayMs: 10 });
  let callCount = 0;
  await assert.rejects(
    () => limiterWithError(async () => {
      callCount += 1;
      throw new Error('boom');
    }),
    /boom/,
    'limiter should propagate task errors',
  );
  assert.equal(callCount, 1, 'task should run exactly once when it throws');
}
