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
