import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createProject } = require('../electron/projectManager.cjs');
const { runIcarusSimulation } = require('../electron/simulator.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(here, '..', '..', 'toolchain', 'oss-cad-suite');

test('New Project starter runs out of the box with the portable Icarus backend', async () => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-first-run-'));
  try {
    const project = await createProject(parent, 'student-demo', true);
    const result = await runIcarusSimulation({
      projectRoot: project.root,
      suiteRoot,
      files: project.files,
      topModule: 'student_demo_tb',
    });
    const vcd = await fsp.readFile(result.vcdPath, 'utf8');
    assert.match(vcd, /\$var .* clk/);
    assert.match(vcd, /\$var .* led/);
  } finally {
    await fsp.rm(parent, { recursive: true, force: true });
  }
});
