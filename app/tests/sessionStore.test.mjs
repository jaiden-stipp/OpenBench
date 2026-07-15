import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createSessionStore } = require('../electron/sessionStore.cjs');
const { ensureExampleProject } = require('../electron/exampleProject.cjs');

test('session and crash drafts survive a new store instance', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-session-'));
  try {
    const store = createSessionStore(root);
    await store.saveSession({
      projectRoot: 'C:/project',
      openFiles: ['design.sv'],
      activeFile: 'design.sv',
      activeView: 'waveform',
      editorCursor: { path: 'design.sv', line: 12, column: 4 },
      waveform: { cursor: 30 },
    });
    await store.saveDraft('C:/project', 'design.sv', 'module recovered; endmodule\n');
    const reopened = createSessionStore(root);
    assert.equal((await reopened.loadSession()).activeView, 'waveform');
    assert.equal(
      (await reopened.loadDraft('C:/project', 'design.sv')).content,
      'module recovered; endmodule\n',
    );
    await reopened.clearDraft('C:/project', 'design.sv');
    assert.equal(await reopened.loadDraft('C:/project', 'design.sv'), null);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('getting-started example is real, editable, and non-destructive', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-example-'));
  try {
    const first = await ensureExampleProject(root);
    assert.deepEqual(
      new Set(first.files),
      new Set(['getting_started_counter.sv', 'getting_started_counter_tb.sv']),
    );
    await fsp.writeFile(path.join(first.root, 'getting_started_counter.sv'), '// student edit\n');
    await ensureExampleProject(root);
    assert.equal(
      await fsp.readFile(path.join(first.root, 'getting_started_counter.sv'), 'utf8'),
      '// student edit\n',
    );
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
