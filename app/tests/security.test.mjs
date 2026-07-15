import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveInside } = require('../electron/security.cjs');

test('accepts files inside the project root', () => {
  const root = path.resolve('fixture-project');
  assert.equal(
    resolveInside(root, path.join(root, 'rtl', 'top.sv')),
    path.join(root, 'rtl', 'top.sv'),
  );
});

test('rejects traversal outside the project root', () => {
  const root = path.resolve('fixture-project');
  assert.throws(() => resolveInside(root, path.resolve(root, '..', 'secret.sv')), /outside/);
});
