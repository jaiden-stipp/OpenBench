import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveToolchainRoot } = require('../electron/toolchain.cjs');

test('prefers a configured project-relative OSS CAD Suite', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rtlbench-toolchain-'));
  try {
    await mkdir(path.join(directory, 'tools', 'suite', 'bin'), { recursive: true });
    assert.equal(
      resolveToolchainRoot({
        projectRoot: directory,
        configuredPath: 'tools/suite',
        resourcesPath: '',
        env: {},
        appDirectory: directory,
      }),
      path.join(directory, 'tools', 'suite'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('reports a deliberate setup error when no toolchain exists', () => {
  assert.throws(
    () =>
      resolveToolchainRoot({
        projectRoot: os.tmpdir(),
        resourcesPath: '',
        env: {},
        appDirectory: os.tmpdir(),
      }),
    /OSS CAD Suite was not found/,
  );
});
