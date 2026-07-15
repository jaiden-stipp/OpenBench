import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildModuleGraph,
  classifyCellType,
  findTopModule,
  sourceForNet,
} from '../src/netlistGraph.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('builds connected schematic data from real Yosys JSON', async () => {
  const jsonPath = path.resolve(
    here,
    '..',
    '..',
    'examples',
    'phase0',
    'results',
    'rtlbench_smoke.json',
  );
  const netlist = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
  const top = findTopModule(netlist);
  assert.equal(top, 'rtlbench_smoke');
  const graph = buildModuleGraph(netlist, top);
  assert.ok(graph.nodes.some((node) => node.kind === 'port' && node.name === 'value'));
  assert.ok(graph.nodes.some((node) => node.type === '$add'));
  assert.ok(graph.nodes.some((node) => node.type === '$adff'));
  assert.ok(
    graph.nodes.filter((node) => node.kind === 'cell').every((node) => !node.name.includes('$')),
  );
  assert.ok(graph.nodes.some((node) => node.type === '$add' && node.name.startsWith('Adder ')));
  assert.ok(graph.edges.length > 0);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)));
  assert.match(sourceForNet(netlist, 'tb.dut.total [3:0]'), /rtlbench_smoke\.sv:/);
});

test('maps Yosys cell types to recognizable schematic symbol families', () => {
  assert.equal(classifyCellType('$adff'), 'register');
  assert.equal(classifyCellType('$_DFFE_PP_'), 'register');
  assert.equal(classifyCellType('$mux'), 'mux');
  assert.equal(classifyCellType('$add'), 'arithmetic');
  assert.equal(classifyCellType('$eq'), 'compare');
  assert.equal(classifyCellType('$and'), 'logic');
  assert.equal(classifyCellType('child', true), 'module');
});
