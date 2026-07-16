import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWaveformIpc, HISTORY_LIMIT } = require('../electron/ipc/waveform.cjs');
const { createWorkspaceRegistry } = require('../electron/workspaceController.cjs');

test('waveform history returns bounded metadata and loads content only on demand', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openbench-wave-history-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) {
    const directory = path.join(root, '.openbench-runs', `run-${index}`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'simulation.vcd'), `$enddefinitions $end\n#${index}\n`);
  }

  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const sender = Object.assign(new EventEmitter(), { id: 7 });
  const registry = createWorkspaceRegistry(root);
  registerWaveformIpc({ ipcMain, getWorkspace: (value) => registry.forSender(value) });

  const runs = await handlers.get('waveform:listRuns')({ sender });
  assert.equal(runs.length, HISTORY_LIMIT);
  assert.ok(runs.every((run) => typeof run.size === 'number'));
  assert.ok(runs.every((run) => !Object.hasOwn(run, 'content')));

  const loaded = await handlers.get('waveform:readRun')({ sender }, runs[0].id);
  assert.match(loaded.content, /\$enddefinitions/);
});

test('workspace state is isolated by Electron sender', () => {
  const registry = createWorkspaceRegistry();
  const first = Object.assign(new EventEmitter(), { id: 1 });
  const second = Object.assign(new EventEmitter(), { id: 2 });
  registry.forSender(first).setProject('first-project');
  registry.forSender(second).setProject('second-project');
  registry.forSender(first).simulationRunning = true;

  assert.equal(registry.forSender(first).captureProject(), 'first-project');
  assert.equal(registry.forSender(second).captureProject(), 'second-project');
  assert.equal(registry.forSender(second).isBackendBusy(), false);
});

test('workspace operation coordination starts and finishes with matching handles', () => {
  const registry = createWorkspaceRegistry('project');
  const sender = Object.assign(new EventEmitter(), { id: 3 });
  const workspace = registry.forSender(sender);
  const child = { kill() {} };
  workspace.startOperation('compile', child);
  assert.equal(workspace.isBackendBusy(), true);
  workspace.finishOperation('compile', {});
  assert.equal(workspace.isBackendBusy(), true);
  workspace.finishOperation('compile', child);
  assert.equal(workspace.isBackendBusy(), false);
});
