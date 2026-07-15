import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createSupportBundle, runBackendSelfTest } = require('../electron/support.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');

test('toolchain health runs a real simulation and Yosys elaboration', async () => {
  const result = await runBackendSelfTest(suiteRoot);
  assert.equal(result.ok, true, result.error);
  assert.match(result.tools.iverilog, /real compile and simulation/);
  assert.match(result.tools.yosys, /real JSON elaboration/);
});

test('support bundle excludes HDL source by default', async () => {
  const result = await createSupportBundle({
    appVersion: 'test',
    project: { name: 'private', files: ['secret.sv'], folders: [] },
    settings: {},
    consoleText: 'raw output',
    includeSource: false,
  });
  assert.equal(result.privacy.sourceIncluded, false);
  assert.equal('source' in result, false);
});
