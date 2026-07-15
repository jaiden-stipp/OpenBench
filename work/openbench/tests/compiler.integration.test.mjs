import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { startIcarusCompile, startVerilatorLint } = require('../electron/compiler.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

test('portable Icarus compiles the real Phase 0 HDL project', async () => {
  const projectRoot = path.resolve(here, '..', '..', 'phase0');
  const suiteRoot = path.resolve(here, '..', '..', 'toolchain', 'oss-cad-suite');
  let output = '';
  const run = startIcarusCompile({
    projectRoot,
    suiteRoot,
    files: ['rtlbench_smoke.sv', 'rtlbench_smoke_tb.sv'],
    onOutput: (_stream, text) => { output += text; },
  });
  const result = await run.completion;
  assert.equal(result.code, 0, output);
});

test('portable Verilator lints the real Phase 0 HDL project', async () => {
  const projectRoot = path.resolve(here, '..', '..', 'phase0');
  const suiteRoot = path.resolve(here, '..', '..', 'toolchain', 'oss-cad-suite');
  let output = '';
  const run = startVerilatorLint({
    projectRoot,
    suiteRoot,
    files: ['rtlbench_smoke.sv', 'rtlbench_smoke_tb.sv'],
    onOutput: (_stream, text) => { output += text; },
  });
  const result = await run.completion;
  assert.equal(result.code, 0, output);
});
