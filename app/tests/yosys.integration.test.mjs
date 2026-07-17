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

test('real Yosys elaborates package-defined packed structs through the Slang frontend', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-yosys-package-'));
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  try {
    await fsp.writeFile(
      path.join(projectRoot, 'cpu_pkg.sv'),
      'package cpu_pkg; typedef struct packed { logic valid; logic [3:0] opcode; } control_t; endpackage\n',
    );
    await fsp.writeFile(
      path.join(projectRoot, 'cpu.sv'),
      'import cpu_pkg::*; module cpu(input logic clk, input control_t control, output logic valid); always_ff @(posedge clk) valid <= control.valid; endmodule\n',
    );
    const result = await runYosysElaboration({
      projectRoot,
      suiteRoot,
      files: ['cpu_pkg.sv', 'cpu.sv'],
      topModule: 'cpu',
    });
    const json = JSON.parse(await fsp.readFile(result.jsonPath, 'utf8'));
    assert.equal(result.top, 'cpu');
    assert.match(json.modules.cpu.attributes.src, /^cpu\.sv:/);
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});

test('Slang elaborates package sources whose project and filenames contain spaces', async () => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench slang paths '));
  const projectRoot = path.join(parent, 'My HDL Project');
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  try {
    await fsp.mkdir(projectRoot);
    await fsp.writeFile(
      path.join(projectRoot, 'CPU Types.sv'),
      'package cpu_types; typedef struct packed { logic valid; } control_t; endpackage\n',
    );
    await fsp.writeFile(
      path.join(projectRoot, 'CPU Core.sv'),
      'import cpu_types::*; module cpu_core(input control_t control, output logic valid); assign valid = control.valid; endmodule\n',
    );
    let output = '';
    const result = await runYosysElaboration({
      projectRoot,
      suiteRoot,
      files: ['CPU Types.sv', 'CPU Core.sv'],
      topModule: 'cpu_core',
      onOutput: (_stream, text) => {
        output += text;
      },
    }).catch((error) => {
      throw new Error(`${error.message}\n${output}`);
    });
    const json = JSON.parse(await fsp.readFile(result.jsonPath, 'utf8'));
    assert.equal(result.top, 'cpu_core');
    assert.match(json.modules.cpu_core.attributes.src, /^CPU Core\.sv:/);
  } finally {
    await fsp.rm(parent, { recursive: true, force: true });
  }
});

test('package text in comments and strings stays on the ordinary Yosys frontend', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-yosys-comments-'));
  const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');
  try {
    await fsp.writeFile(
      path.join(projectRoot, 'top.sv'),
      'module top(output logic y); // package old_types;\ninitial $display("package string_types;"); assign y = 1; endmodule\n',
    );
    const result = await runYosysElaboration({
      projectRoot,
      suiteRoot,
      files: ['top.sv'],
      topModule: 'top',
    });
    assert.equal(result.top, 'top');
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});
