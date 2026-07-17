import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createTraceMonitor, stageSimulationAssets } = require('../electron/simulator.cjs');

test('stages memory images without copying unrelated project output', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-assets-'));
  try {
    const run = path.join(root, '.openbench-runs', 'current');
    await fsp.mkdir(path.join(root, 'programs'), { recursive: true });
    await fsp.mkdir(run, { recursive: true });
    await fsp.writeFile(path.join(root, 'programs', 'cpu.hex'), '00100093\n');
    await fsp.writeFile(path.join(root, 'notes.txt'), 'do not stage');
    await stageSimulationAssets(root, run);
    assert.equal(await fsp.readFile(path.join(run, 'programs', 'cpu.hex'), 'utf8'), '00100093\n');
    await assert.rejects(() => fsp.access(path.join(run, 'notes.txt')));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('adds an editable-source-independent VCD monitor when a testbench has no dump calls', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-trace-'));
  try {
    const source = path.join(root, 'cpu_tb.sv');
    await fsp.writeFile(source, 'module cpu_tb; initial #10 $finish; endmodule\n');
    const monitor = await createTraceMonitor(root, 'cpu_tb', [source]);
    assert.ok(monitor);
    assert.match(await fsp.readFile(monitor, 'utf8'), /\$dumpvars\(0, cpu_tb\)/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
