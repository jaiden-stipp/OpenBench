import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { startIcarusCompile } = require('../electron/compiler.cjs');
const { createErrorTranslator } = require('../electron/errorTranslator.cjs');
const { runIcarusSimulation } = require('../electron/simulator.cjs');
const { generateStarterTestbench } = require('../electron/testbenchGenerator.cjs');
const { runYosysElaboration } = require('../electron/yosys.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(here, '..', '..', '.toolchain', 'oss-cad-suite');

test('beginner FSM goes from design-only Yosys metadata to generated testbench and real VCD', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'rtlbench-beginner-'));
  try {
    await fsp.copyFile(
      path.resolve(here, '..', '..', 'examples', 'fixtures', 'beginner-fsm', 'traffic_light.sv'),
      path.join(projectRoot, 'traffic_light.sv'),
    );
    const elaborated = await runYosysElaboration({
      projectRoot,
      suiteRoot,
      files: ['traffic_light.sv'],
      topModule: 'traffic_light',
    });
    const netlist = JSON.parse(await fsp.readFile(elaborated.jsonPath, 'utf8'));
    const generated = generateStarterTestbench(netlist, 'traffic_light');
    await fsp.writeFile(path.join(projectRoot, generated.fileName), generated.content, 'utf8');
    assert.deepEqual(generated.detected.clocks, ['clk']);
    assert.deepEqual(generated.detected.resets, ['rst_n']);
    const simulation = await runIcarusSimulation({
      projectRoot,
      suiteRoot,
      files: ['traffic_light.sv', generated.fileName],
      topModule: generated.testbenchName,
    });
    const vcdText = await fsp.readFile(simulation.vcdPath, 'utf8');
    assert.match(vcdText, /\$var .* request/);
    assert.match(vcdText, /\$var .* green/);
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});

test('a real beginner syntax error receives a clickable plain-language translation', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'rtlbench-beginner-error-'));
  try {
    await fsp.writeFile(
      path.join(projectRoot, 'broken.sv'),
      'module broken(input logic a, output logic y);\nassign y = a\nendmodule\n',
      'utf8',
    );
    const translator = createErrorTranslator({ backend: 'iverilog', projectRoot });
    const translations = [];
    let raw = '';
    const run = startIcarusCompile({
      projectRoot,
      suiteRoot,
      files: ['broken.sv'],
      onOutput: (stream, text) => {
        raw += text;
        translations.push(...translator.push(stream, text).translations);
      },
    });
    const result = await run.completion;
    assert.notEqual(result.code, 0);
    assert.match(raw, /syntax error/i);
    assert.equal(translations[0].id, 'syntax');
    assert.equal(translations[0].location.path, 'broken.sv');
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});

test('a real unsupported coverage construct is identified at the source line', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'rtlbench-beginner-unsupported-'));
  try {
    await fsp.copyFile(
      path.resolve(
        here,
        '..',
        '..',
        'examples',
        'fixtures',
        'beginner-unsupported',
        'unsupported.sv',
      ),
      path.join(projectRoot, 'unsupported.sv'),
    );
    const translator = createErrorTranslator({ backend: 'iverilog', projectRoot });
    const translations = [];
    const run = startIcarusCompile({
      projectRoot,
      suiteRoot,
      files: ['unsupported.sv'],
      onOutput: (stream, text) => translations.push(...translator.push(stream, text).translations),
    });
    const result = await run.completion;
    assert.notEqual(result.code, 0);
    const unsupported = translations.find((entry) => entry.id === 'unsupported-construct');
    assert.ok(unsupported);
    assert.equal(unsupported.location.line, 2);
    assert.match(unsupported.explanation, /functional coverage/);
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});
