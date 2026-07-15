import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDiagnostic } from '../src/diagnostics.js';

test('parses Icarus file and line diagnostics', () => {
  assert.deepEqual(parseDiagnostic('rtl/top.sv:17: syntax error'), {
    path: 'rtl/top.sv',
    line: 17,
    column: 1,
    message: 'syntax error',
  });
});

test('parses Windows paths and columns', () => {
  assert.deepEqual(parseDiagnostic('C:\\hdl\\top.sv:9:4: unexpected token'), {
    path: 'C:/hdl/top.sv',
    line: 9,
    column: 4,
    message: 'unexpected token',
  });
});

test('ignores ordinary console text', () => {
  assert.equal(parseDiagnostic('Compile finished with exit code 0.'), null);
});
