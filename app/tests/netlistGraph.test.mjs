import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildModuleGraph,
  buildOverviewGraph,
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
    'rtldeck_smoke.json',
  );
  const netlist = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
  const top = findTopModule(netlist);
  assert.equal(top, 'rtldeck_smoke');
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
  assert.match(sourceForNet(netlist, 'tb.dut.total [3:0]'), /rtldeck_smoke\.sv:/);
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

test('builds a source-group overview from a real flattened netlist without inventing data', () => {
  const netlist = {
    modules: {
      cpu: {
        attributes: { top: '00000000000000000000000000000001' },
        ports: {
          clk: { direction: 'input', bits: [1] },
          result: { direction: 'output', bits: [4] },
        },
        cells: {
          $add$1: {
            type: '$add',
            attributes: { src: 'rtl/execute.sv:10.2-10.20' },
            port_directions: { A: 'input', Y: 'output' },
            connections: { A: [1], Y: [2] },
          },
          $dff$1: {
            type: '$dff',
            attributes: { src: 'rtl/registers.sv:20.2-20.20' },
            port_directions: { D: 'input', Q: 'output' },
            connections: { D: [2], Q: [4] },
          },
        },
        netnames: {
          clk: { bits: [1] },
          sum: { bits: [2] },
          result: { bits: [4] },
        },
      },
    },
  };
  const overview = buildOverviewGraph(netlist, 'cpu');
  assert.equal(overview.overview, true);
  assert.deepEqual(
    overview.nodes.filter((node) => node.symbol === 'group').map((node) => node.name),
    ['execute.sv', 'registers.sv'],
  );
  assert.ok(overview.edges.length > 0);
  assert.ok(
    overview.nodes
      .filter((node) => node.symbol === 'group')
      .every((node) => node.source && node.type === 'Source group'),
  );
});
