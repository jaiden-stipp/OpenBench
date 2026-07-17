import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { orderSourceFiles } = require('../electron/sourceOrder.cjs');

test('package providers precede SystemVerilog files that import them', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-source-order-'));
  try {
    await fsp.writeFile(path.join(root, 'alu.sv'), 'import cpu_pkg::*; module alu; endmodule');
    await fsp.writeFile(path.join(root, 'cpu_pkg.sv'), 'package cpu_pkg; endpackage');
    await fsp.writeFile(path.join(root, 'top.sv'), 'module top; alu child(); endmodule');
    assert.deepEqual(await orderSourceFiles(root, ['alu.sv', 'cpu_pkg.sv', 'top.sv']), [
      'cpu_pkg.sv',
      'alu.sv',
      'top.sv',
    ]);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('comments and strings do not create package dependencies', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-source-comments-'));
  try {
    await fsp.writeFile(
      path.join(root, 'first.sv'),
      'module first; string note = "import later_pkg::*;"; // import later_pkg::*;\nendmodule',
    );
    await fsp.writeFile(
      path.join(root, 'second.sv'),
      '// package later_pkg;\nmodule second; endmodule',
    );
    assert.deepEqual(await orderSourceFiles(root, ['first.sv', 'second.sv']), [
      'first.sv',
      'second.sv',
    ]);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('reports package dependency cycles instead of silently changing order', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-source-cycle-'));
  try {
    await fsp.writeFile(path.join(root, 'a.sv'), 'package a; import b::*; endpackage');
    await fsp.writeFile(path.join(root, 'b.sv'), 'package b; import a::*; endpackage');
    await assert.rejects(
      () => orderSourceFiles(root, ['a.sv', 'b.sv']),
      /package dependency cycle.*a\.sv.*b\.sv/i,
    );
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
