import assert from 'node:assert/strict';
import test from 'node:test';
import { formatVcdValue, parseVcd, valueAt } from '../src/vcdParser.js';

const fixture = `$timescale 1 ns $end
$scope module tb $end
$var wire 1 ! clk $end
$var wire 4 # value [3:0] $end
$upscope $end
$enddefinitions $end
#0
0!
b0000 #
#5
1!
b1010 #
#10
0!
`;

test('parses hierarchy, time, widths, and changes', () => {
  const data = parseVcd(fixture);
  assert.equal(data.timescale, '1ns');
  assert.equal(data.endTime, 10);
  assert.equal(data.timestampCount, 3);
  assert.equal(data.signals[1].path, 'tb.value [3:0]');
  assert.deepEqual(data.signals[1].changes, [[0, '0000'], [5, '1010']]);
});

test('looks up and formats cursor values', () => {
  const signal = parseVcd(fixture).signals[1];
  assert.equal(valueAt(signal.changes, 7), '1010');
  assert.equal(formatVcdValue('1010', 4, 'hex'), '0xa');
  assert.equal(formatVcdValue('1010', 4, 'dec'), '10');
});

test('parses 50,000 timestamps within the benchmark budget', () => {
  let text = '$timescale 1ps $end\n$scope module tb $end\n$var wire 1 ! clk $end\n$upscope $end\n$enddefinitions $end\n';
  for (let time = 0; time < 50_000; time += 1) text += `#${time}\n${time % 2}!\n`;
  const started = performance.now();
  const data = parseVcd(text);
  const elapsed = performance.now() - started;
  assert.equal(data.timestampCount, 50_000);
  assert.equal(data.signals[0].changes.length, 50_000);
  assert.ok(elapsed < 1_500, `50k-step parse took ${elapsed.toFixed(1)} ms`);
});
