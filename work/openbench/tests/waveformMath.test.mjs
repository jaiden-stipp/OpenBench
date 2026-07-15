import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleVisibleChanges } from '../src/waveformMath.js';

test('pixel sampler bounds 50,000 transitions to canvas resolution', () => {
  const changes = Array.from({ length: 50_000 }, (_, time) => [time, String(time % 2)]);
  const started = performance.now();
  const sampled = sampleVisibleChanges(changes, 0, 49_999, 1_920);
  const elapsed = performance.now() - started;
  assert.ok(sampled.length <= 1_921, `sampled ${sampled.length} changes`);
  assert.ok(elapsed < 100, `sampling took ${elapsed.toFixed(1)} ms`);
  assert.deepEqual(sampled.at(-1), [49_999, '1']);
});
