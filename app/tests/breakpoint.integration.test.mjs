import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { compileBreakpointMonitor, runIcarusSimulation } = require('../electron/simulator.cjs');
const { parseVcd } = await import('../src/vcdParser.ts');
const here = path.dirname(fileURLToPath(import.meta.url));

test('rejects injected breakpoint hierarchy or values', () => {
  assert.throws(
    () => compileBreakpointMonitor([{ signalPath: 'tb.sig); $finish;', width: 1, value: '1' }]),
    /not safe/,
  );
  assert.throws(
    () => compileBreakpointMonitor([{ signalPath: 'tb.sig', width: 1, value: '1); $finish' }]),
    /must be/,
  );
});

test('Icarus evaluates a compiled waveform condition inside the real simulation', async () => {
  const projectRoot = path.resolve(here, '..', '..', 'examples', 'phase0');
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  let output = '';
  const result = await runIcarusSimulation({
    projectRoot,
    suiteRoot,
    files: ['rtldeck_smoke.sv', 'rtldeck_smoke_tb.sv'],
    breakpoints: [{ signalPath: 'rtldeck_smoke_tb.dut.total [3:0]', width: 4, value: '3' }],
    onOutput: (_stream, text) => {
      output += text;
    },
  }).catch((error) => {
    throw new Error(`${error.message}\n${output}`);
  });
  assert.match(output, /\[RTLDECK_BREAKPOINT\].*total == 3/);
  assert.equal(result.breakpointHit.condition, 'rtldeck_smoke_tb.dut.total == 3');
  assert.ok(result.breakpointHit.time < 42000);
  const vcd = parseVcd(await fsp.readFile(result.vcdPath, 'utf8'));
  assert.ok(
    vcd.endTime < 42000,
    'compiled condition should end the run before the ordinary testbench finish',
  );
});
