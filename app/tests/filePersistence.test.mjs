import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { persistDirtyFiles } from '../src/filePersistence.ts';

test('backend operations see every dirty editor buffer after save all', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openbench-save-all-'));
  const firstPath = path.join(root, 'first.sv');
  const secondPath = path.join(root, 'second.sv');
  const cleanPath = path.join(root, 'clean.sv');
  try {
    await Promise.all([
      writeFile(firstPath, 'module first_old; endmodule\n'),
      writeFile(secondPath, 'module second_old; endmodule\n'),
      writeFile(cleanPath, 'module clean; endmodule\n'),
    ]);
    const files = [
      {
        path: firstPath,
        content: 'module first_new; endmodule\n',
        savedContent: 'module first_old; endmodule\n',
      },
      {
        path: secondPath,
        content: 'module second_new; endmodule\n',
        savedContent: 'module second_old; endmodule\n',
      },
      {
        path: cleanPath,
        content: 'module clean; endmodule\n',
        savedContent: 'module clean; endmodule\n',
      },
    ];

    const snapshots = await persistDirtyFiles(files, (file) => writeFile(file.path, file.content));
    const backendSources = await Promise.all(
      [firstPath, secondPath, cleanPath].map((file) => readFile(file, 'utf8')),
    );

    assert.deepEqual(
      snapshots.map((file) => file.path),
      [firstPath, secondPath],
    );
    assert.deepEqual(backendSources, [
      'module first_new; endmodule\n',
      'module second_new; endmodule\n',
      'module clean; endmodule\n',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
