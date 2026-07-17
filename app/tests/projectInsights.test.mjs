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

test('keeps the DUT as design top even when the testbench instantiates it', () => {
  const result = analyzeProjectSources([
    { path: 'rtl/leaf.sv', content: 'module leaf(input logic a); endmodule' },
    {
      path: 'rtl/cpu.sv',
      content: 'module cpu(input logic clk); leaf execute(.a(clk)); endmodule',
    },
    {
      path: 'tb/cpu_tb.sv',
      content:
        'module cpu_tb; logic clk; cpu dut(.clk(clk)); initial begin $dumpfile("cpu.vcd"); $dumpvars; wait(clk); $display("done"); $finish; end endmodule',
    },
  ]);
  assert.equal(result.suggestedTop, 'cpu');
  assert.equal(result.suggestedSimulationTop, 'cpu_tb');
  assert.deepEqual(result.missingModules, []);
});

test('does not mistake language constructs or system tasks for modules', () => {
  const result = analyzeProjectSources([
    {
      path: 'cpu.sv',
      content:
        'module cpu(input logic clk); always_comb begin case (clk) 1: if (clk) begin end else begin end endcase end endmodule',
    },
    {
      path: 'cpu_tb.sv',
      content:
        'module cpu_tb; cpu dut(); initial begin $dumpfile("x.vcd"); $dumpvars; wait(1); $display("ok"); $fatal; end endmodule',
    },
  ]);
  assert.deepEqual(result.missingModules, []);
});

test('does not report named ports, casts, or case expressions as missing modules', () => {
  const result = analyzeProjectSources([
    {
      path: 'cpu.sv',
      content: `module cpu(input logic clk, output logic [31:0] result);
        alu execute(.ALU_result(result), .clk(clk));
        always_comb case (clk) 1'b1: result = (result + 1); default: result = 0; endcase
      endmodule
      module alu(input logic clk, output logic [31:0] ALU_result); endmodule`,
    },
    {
      path: 'cpu_tb.sv',
      content: `module cpu_tb; real cpi; logic clk, result; cpu dut(.clk(clk), .result(result));
        initial cpi = real'(result);
      endmodule`,
    },
  ]);
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
