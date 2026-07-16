import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseVcd } from '../src/vcdParser.ts';

const require = createRequire(import.meta.url);
const { runIcarusSimulation } = require('../electron/simulator.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

test('real Icarus simulation produces a parseable VCD', async () => {
  const projectRoot = path.resolve(here, '..', '..', 'examples', 'phase0');
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  let output = '';
  const result = await runIcarusSimulation({
    projectRoot,
    suiteRoot,
    files: ['rtlbench_smoke.sv', 'rtlbench_smoke_tb.sv'],
    onOutput: (_stream, text) => {
      output += text;
    },
  });
  assert.equal(result.code, 0, output);
  const parsed = parseVcd(await fsp.readFile(result.vcdPath, 'utf8'));
  assert.ok(parsed.signals.some((signal) => signal.path.endsWith('.total [3:0]')));
  assert.equal(parsed.endTime, 42_000);
});
