import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { runYosysElaboration } = require('../electron/yosys.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

test('real Yosys elaboration produces source-attributed JSON', async () => {
  const projectRoot = path.resolve(here, '..', '..', 'examples', 'phase0');
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  let output = '';
  const result = await runYosysElaboration({
    projectRoot,
    suiteRoot,
    files: ['rtlbench_smoke.sv'],
    topModule: 'rtlbench_smoke',
    onOutput: (_stream, text) => {
      output += text;
    },
  });
  assert.equal(result.code, 0, output);
  assert.equal(result.top, 'rtlbench_smoke');
  const json = JSON.parse(await fsp.readFile(result.jsonPath, 'utf8'));
  const add = Object.values(json.modules.rtlbench_smoke.cells).find((cell) => cell.type === '$add');
  assert.match(add.attributes.src, /rtlbench_smoke\.sv/);
});

test('real Yosys honors configured include paths', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'rtlbench-yosys-include-'));
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  try {
    await fsp.mkdir(path.join(projectRoot, 'include files'));
    await fsp.writeFile(path.join(projectRoot, 'include files', 'width.vh'), '`define WIDTH 4\n');
    await fsp.writeFile(
      path.join(projectRoot, 'top.sv'),
      '`include "width.vh"\nmodule top(input logic [`WIDTH-1:0] a, output logic [`WIDTH-1:0] y); assign y = a; endmodule\n',
    );
    let output = '';
    const result = await runYosysElaboration({
      projectRoot,
      suiteRoot,
      files: ['top.sv'],
      topModule: 'top',
      includePaths: ['include files'],
      onOutput: (_stream, text) => {
        output += text;
      },
    }).catch((error) => {
      throw new Error(`${error.message}\n${output}`);
    });
    const json = JSON.parse(await fsp.readFile(result.jsonPath, 'utf8'));
    assert.equal(json.modules.top.ports.a.bits.length, 4);
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});
