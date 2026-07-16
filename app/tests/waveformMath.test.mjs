import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjacentTransitionTime,
  formatSimulationTime,
  hasChangeInRange,
  sampleVisibleChanges,
} from '../src/waveformMath.ts';

test('pixel sampler bounds 50,000 transitions to canvas resolution', () => {
  const changes = Array.from({ length: 50_000 }, (_, time) => [time, String(time % 2)]);
  const started = performance.now();
  const sampled = sampleVisibleChanges(changes, 0, 49_999, 1_920);
  const elapsed = performance.now() - started;
  assert.ok(sampled.length <= 1_921, `sampled ${sampled.length} changes`);
  assert.ok(elapsed < 100, `sampling took ${elapsed.toFixed(1)} ms`);
  assert.deepEqual(sampled.at(-1), [49_999, '1']);
});

test('formats raw VCD ticks in a student-readable physical unit', () => {
  assert.equal(formatSimulationTime(44_931, '1ps'), '44.931 ns');
  assert.equal(formatSimulationTime(25, '10ns'), '250 ns');
});

test('range and edge lookups use sorted transition positions', () => {
  const changes = [
    [0, '0'],
    [10, '1'],
    [25, '0'],
    [100, '1'],
  ];
  assert.equal(hasChangeInRange(changes, 11, 24), false);
  assert.equal(hasChangeInRange(changes, 11, 25), true);
  assert.equal(adjacentTransitionTime(changes, 10, 1), 25);
  assert.equal(adjacentTransitionTime(changes, 10, -1), 0);
  assert.equal(adjacentTransitionTime(changes, 24, 1), 25);
  assert.equal(adjacentTransitionTime(changes, 24, -1), 10);
});
