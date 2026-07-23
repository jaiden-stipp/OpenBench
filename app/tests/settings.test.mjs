import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  loadProjectSettings,
  normalizeSettings,
  saveProjectSettings,
} = require('../electron/settings.cjs');

test('normalizes project backend settings', () => {
  assert.deepEqual(
    normalizeSettings({
      topModule: ' top ',
      simulationTop: ' tb ',
      includePaths: [' inc ', '', 4],
      simulator: 'verilator',
      toolchainPath: ' ../tools ',
    }),
    {
      topModule: 'top',
      simulationTop: 'tb',
      includePaths: ['inc'],
      simulator: 'verilator',
      toolchainPath: '../tools',
    },
  );
});

test('persists and reloads .rtldeck-settings.json settings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rtldeck-settings-'));
  try {
    const saved = await saveProjectSettings(directory, {
      topModule: 'chip',
      simulationTop: 'chip_tb',
      includePaths: ['include'],
      simulator: 'iverilog',
      toolchainPath: 'tools/suite',
    });
    assert.deepEqual(await loadProjectSettings(directory), saved);
    assert.match(
      await readFile(path.join(directory, '.rtldeck-settings.json'), 'utf8'),
      /"toolchainPath": "tools\/suite"/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('loads legacy .rtlbench.json settings without rewriting the project', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rtldeck-legacy-settings-'));
  try {
    await writeFile(
      path.join(directory, '.rtlbench.json'),
      JSON.stringify({ topModule: 'legacy_top', simulator: 'verilator' }),
    );
    const loaded = await loadProjectSettings(directory);
    assert.equal(loaded.topModule, 'legacy_top');
    assert.equal(loaded.simulator, 'verilator');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
