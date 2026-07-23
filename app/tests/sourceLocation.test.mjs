import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { parseYosysSource } from '../src/sourceLocation.js';

const require = createRequire(import.meta.url);
const { normalizeNetlistSources } = require('../electron/yosys.cjs');

test('normalizes absolute Yosys source attributes into project-relative locations', () => {
  assert.deepEqual(
    parseYosysSource('C:/projects/demo/rtl/top.sv:24.4-24.27', 'C:\\projects\\demo'),
    { path: 'rtl/top.sv', line: 24, column: 4 },
  );
});

test('uses the first source when Yosys joins multiple attributes', () => {
  assert.deepEqual(parseYosysSource('rtl/a.sv:3.2-3.7|rtl/b.sv:9.1-9.4', 'C:/demo'), {
    path: 'rtl/a.sv',
    line: 3,
    column: 2,
  });
});

test('accepts Yosys locations that only provide a source line', () => {
  assert.deepEqual(parseYosysSource('rtl/cpu.sv:42', 'C:/demo'), {
    path: 'rtl/cpu.sv',
    line: 42,
    column: 1,
  });
});

test('normalizes slang source paths from a generated run back to the project', () => {
  const netlist = { modules: { cpu: { attributes: { src: '../../rtl/cpu.sv:3.8-4.2' } } } };
  normalizeNetlistSources(netlist, 'C:/project', 'C:/project/.rtldeck-runs/yosys-run');
  assert.equal(netlist.modules.cpu.attributes.src, 'rtl/cpu.sv:3.8-4.2');
});
