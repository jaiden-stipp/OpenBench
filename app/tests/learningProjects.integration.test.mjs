import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ensureExampleProject, LESSONS } = require('../electron/exampleProject.cjs');
const { runIcarusSimulation } = require('../electron/simulator.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(here, '..', '..', 'toolchain', 'oss-cad-suite');

test('every built-in lesson produces a genuine waveform', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-lessons-'));
  try {
    for (const [id, lesson] of Object.entries(LESSONS)) {
      const project = await ensureExampleProject(base, id);
      const result = await runIcarusSimulation({
        projectRoot: project.root,
        files: project.files,
        suiteRoot,
        topModule: lesson.simulationTop,
      });
      assert.ok((await fsp.stat(result.vcdPath)).size > 0, `${id} should create a non-empty VCD`);
    }
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});
