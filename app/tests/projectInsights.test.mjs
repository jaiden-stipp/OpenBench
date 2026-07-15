import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProjectSources, explainWaveform } from '../src/projectInsights.js';

test('suggests design and simulation tops from beginner HDL', () => {
  const result = analyzeProjectSources(
    [
      { path: 'counter.sv', content: 'module counter(input clk); endmodule' },
      {
        path: 'counter_tb.sv',
        content:
          'module counter_tb; counter dut(); initial begin $dumpvars; #10 $finish; end endmodule',
      },
    ],
    {},
  );
  assert.equal(result.suggestedTop, 'counter');
  assert.equal(result.suggestedSimulationTop, 'counter_tb');
  assert.deepEqual(result.missingModules, []);
});

test('explains flat unknown waveforms without inventing results', () => {
  const result = explainWaveform({
    endTime: 10,
    timestampCount: 2,
    signals: [{ name: 'state', changes: [{ time: 0, value: 'x' }] }],
  });
  assert.ok(result.some((item) => item.title.includes('never changed')));
  assert.ok(result.some((item) => item.title.includes('X or Z')));
  assert.ok(result.some((item) => item.title.includes('clock')));
});
