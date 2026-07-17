import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  activateProject,
  createFile,
  createFolder,
  createProject,
  duplicateFile,
  importFiles,
  loadManifest,
  projectData,
  removeEntry,
  renameEntry,
} = require('../electron/projectManager.cjs');

test('folder import persists exactly the selected HDL files', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-import-'));
  try {
    await fsp.writeFile(path.join(root, 'design.sv'), 'module design; endmodule\n');
    await fsp.writeFile(path.join(root, 'unused.v'), 'module unused; endmodule\n');
    const project = await activateProject(root, ['design.sv'], 'Learning FSM');
    assert.equal(project.name, 'Learning FSM');
    assert.deepEqual(project.files, ['design.sv']);
    assert.deepEqual((await loadManifest(root)).files, ['design.sv']);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('new starter project is immediately runnable and has project settings', async () => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-new-'));
  try {
    const project = await createProject(parent, 'first-counter', true);
    assert.deepEqual(new Set(project.files), new Set(['first_counter.sv', 'first_counter_tb.sv']));
    const settings = JSON.parse(
      await fsp.readFile(path.join(project.root, '.rtlbench.json'), 'utf8'),
    );
    assert.equal(settings.topModule, 'first_counter');
    assert.equal(settings.simulationTop, 'first_counter_tb');
    assert.match(
      await fsp.readFile(path.join(project.root, 'first_counter_tb.sv'), 'utf8'),
      /\$dumpvars/,
    );
  } finally {
    await fsp.rm(parent, { recursive: true, force: true });
  }
});

test('new starter project honors the design top chosen in the creation dialog', async () => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-custom-top-'));
  try {
    const project = await createProject(parent, 'Course CPU', true, 'cpu_core');
    assert.deepEqual(new Set(project.files), new Set(['cpu_core.sv', 'cpu_core_tb.sv']));
    const settings = JSON.parse(
      await fsp.readFile(path.join(project.root, '.rtlbench.json'), 'utf8'),
    );
    assert.equal(settings.topModule, 'cpu_core');
    assert.equal(settings.simulationTop, 'cpu_core_tb');
    assert.match(
      await fsp.readFile(path.join(project.root, 'cpu_core.sv'), 'utf8'),
      /module cpu_core/,
    );
  } finally {
    await fsp.rm(parent, { recursive: true, force: true });
  }
});

test('create, rename, duplicate, and remove keep the manifest synchronized', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-files-'));
  try {
    await activateProject(root, [], 'Files');
    await createFile(root, 'rtl/counter.sv', 'module counter; endmodule\n');
    assert.deepEqual((await projectData(root)).files, ['rtl/counter.sv']);
    const renamed = await renameEntry(root, 'rtl/counter.sv', 'timer.sv');
    assert.equal(renamed, 'rtl/timer.sv');
    const copy = await duplicateFile(root, renamed);
    assert.equal(copy, 'rtl/timer copy.sv');
    await removeEntry(root, renamed, (target) => fsp.rm(target));
    assert.deepEqual((await projectData(root)).files, ['rtl/timer copy.sv']);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('empty folders persist in the project tree and stay synchronized', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-folders-'));
  try {
    await activateProject(root, [], 'Folders');
    assert.equal(await createFolder(root, 'rtl/core'), 'rtl/core');
    let project = await projectData(root);
    assert.deepEqual(project.folders, ['rtl', 'rtl/core']);
    assert.equal(project.tree[0].kind, 'directory');
    assert.equal(project.tree[0].children[0].path, 'rtl/core');

    assert.equal(await renameEntry(root, 'rtl/core', 'logic'), 'rtl/logic');
    project = await projectData(root);
    assert.deepEqual(project.folders, ['rtl', 'rtl/logic']);

    await removeEntry(root, 'rtl/logic', (target) => fsp.rm(target, { recursive: true }));
    project = await projectData(root);
    assert.deepEqual(project.folders, ['rtl']);
    assert.deepEqual(project.tree[0].children, []);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('project paths cannot escape the project root', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-security-'));
  try {
    await assert.rejects(() => createFile(root, '../escape.sv'), /inside the project/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('file import rejects duplicate basenames without copying either file', async (context) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-duplicate-import-'));
  context.after(() => fsp.rm(root, { recursive: true, force: true }));
  const first = path.join(root, 'source-a');
  const second = path.join(root, 'source-b');
  const project = path.join(root, 'project');
  await Promise.all([first, second, project].map((directory) => fsp.mkdir(directory)));
  await fsp.writeFile(path.join(first, 'shared.sv'), 'module first; endmodule\n');
  await fsp.writeFile(path.join(second, 'shared.sv'), 'module second; endmodule\n');
  await assert.rejects(
    () => importFiles(project, [path.join(first, 'shared.sv'), path.join(second, 'shared.sv')]),
    /More than one selected file/,
  );
  await assert.rejects(() => fsp.access(path.join(project, 'shared.sv')));
});
