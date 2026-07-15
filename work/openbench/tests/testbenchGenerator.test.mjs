import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { generateStarterTestbench } = require('../electron/testbenchGenerator.cjs');

const netlist = { modules: { counter: { ports: {
  clk: { direction: 'input', bits: [1] }, rst_n: { direction: 'input', bits: [2] }, enable: { direction: 'input', bits: [3] }, count: { direction: 'output', bits: [4, 5, 6, 7] },
} } } };

test('generates a simple editable testbench from Yosys port metadata', () => {
  const generated = generateStarterTestbench(netlist, 'counter');
  assert.equal(generated.fileName, 'counter_tb.sv');
  assert.deepEqual(generated.detected, { clocks: ['clk'], resets: ['rst_n'], stimulusInputs: ['enable'] });
  assert.match(generated.content, /always #5 clk = ~clk/);
  assert.match(generated.content, /rst_n = 1'b0/);
  assert.match(generated.content, /\.count\(count\)/);
  assert.match(generated.content, /logic \[3:0\] count/);
  assert.doesNotMatch(generated.content, /class|mailbox|factory/i);
});

test('refuses escaped identifiers instead of emitting invalid beginner scaffolding', () => {
  assert.throws(() => generateStarterTestbench({ modules: { '\\odd name': { ports: {} } } }, '\\odd name'), /unsupported identifier/);
});
