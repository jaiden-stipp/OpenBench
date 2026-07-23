import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the basic waveform layout gives the signal grid all remaining height', async () => {
  const [component, styles] = await Promise.all([
    fsp.readFile(path.join(appRoot, 'src', 'WaveformPanel.tsx'), 'utf8'),
    fsp.readFile(path.join(appRoot, 'src', 'styles.css'), 'utf8'),
  ]);
  assert.match(component, /with-advanced-tools/);
  assert.match(
    styles,
    /\.waveform-panel\s*\{[\s\S]*?grid-template-rows:\s*38px minmax\(0,\s*1fr\)/,
  );
  assert.match(
    styles,
    /\.waveform-panel\.with-advanced-tools\s*\{[\s\S]*?38px 34px 34px minmax\(0,\s*1fr\)/,
  );
});

test('light mode explicitly preserves schematic port-label contrast', async () => {
  const styles = await fsp.readFile(path.join(appRoot, 'src', 'styles.css'), 'utf8');
  assert.match(styles, /\.light \.schematic-node \.port-name\s*\{[\s\S]*?fill:/);
  assert.match(styles, /\.light \.schematic-node \.port-direction\s*\{[\s\S]*?fill:/);
});
