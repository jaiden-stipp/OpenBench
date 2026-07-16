import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { isAllowedNavigation, resolveInside } = require('../electron/security.cjs');

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

test('navigation validation compares development origins and packaged file paths', () => {
  assert.equal(
    isAllowedNavigation('http://127.0.0.1:5173/editor', 'http://127.0.0.1:5173', ''),
    true,
  );
  assert.equal(
    isAllowedNavigation('http://127.0.0.1:51730/editor', 'http://127.0.0.1:5173', ''),
    false,
  );
  assert.equal(
    isAllowedNavigation('file:///app/dist/index.html#source', '', 'file:///app/dist/index.html'),
    true,
  );
  assert.equal(
    isAllowedNavigation('file:///app/dist/index.html.evil', '', 'file:///app/dist/index.html'),
    false,
  );
});
