const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const releaseRoot = path.resolve(__dirname, '..', 'release');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (process.platform !== 'darwin') throw new Error('macOS verification must run on macOS.');
if (!fs.existsSync(releaseRoot))
  throw new Error(`Release directory does not exist: ${releaseRoot}`);

const appBundle = fs
  .readdirSync(releaseRoot)
  .filter((name) => name.startsWith('mac'))
  .map((name) => path.join(releaseRoot, name, 'OpenBench.app'))
  .find((candidate) => fs.existsSync(candidate));
if (!appBundle) throw new Error('Packaged OpenBench.app was not found.');

run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundle]);
run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appBundle]);

const artifacts = fs
  .readdirSync(releaseRoot)
  .filter((name) => name.endsWith('.dmg') || name.endsWith('.zip'))
  .map((name) => path.join(releaseRoot, name));
if (artifacts.length < 2) throw new Error('Expected DMG and ZIP macOS artifacts.');

for (const diskImage of artifacts.filter((file) => file.endsWith('.dmg'))) {
  run('xcrun', ['stapler', 'validate', diskImage]);
  run('spctl', [
    '--assess',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    '-v',
    diskImage,
  ]);
}

const checksums = artifacts.map((file) => `${sha256(file)}  ${path.basename(file)}`).join('\n');
fs.writeFileSync(path.join(releaseRoot, 'SHA256SUMS.txt'), `${checksums}\n`, 'utf8');
console.log(
  'macOS Developer ID signature, Gatekeeper, notarization ticket, and checksums verified.',
);
