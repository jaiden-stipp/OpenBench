const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const releaseRoot = path.resolve(__dirname, '..', 'release');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (process.platform !== 'linux') throw new Error('Linux verification must run on Linux.');
if (!fs.existsSync(releaseRoot))
  throw new Error(`Release directory does not exist: ${releaseRoot}`);

const artifacts = fs
  .readdirSync(releaseRoot)
  .filter((name) => name.endsWith('.deb') || name.endsWith('.tar.gz'))
  .map((name) => path.join(releaseRoot, name));
if (artifacts.length < 2) throw new Error('Expected deb and tar.gz Linux artifacts.');

const unpacked = path.join(releaseRoot, 'linux-unpacked');
if (!fs.existsSync(unpacked))
  throw new Error('Expected release/linux-unpacked for malware scanning.');
run('clamscan', ['--recursive', '--infected', '--no-summary', unpacked]);
for (const artifact of artifacts) run('clamscan', ['--infected', '--no-summary', artifact]);

const checksums = artifacts.map((file) => `${sha256(file)}  ${path.basename(file)}`).join('\n');
const checksumFile = path.join(releaseRoot, 'SHA256SUMS.txt');
fs.writeFileSync(checksumFile, `${checksums}\n`, 'utf8');

const signingReady = Boolean(process.env.LINUX_GPG_PRIVATE_KEY && process.env.LINUX_GPG_PASSPHRASE);
if (signingReady) {
  const gpgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openbench-release-gpg-'));
  try {
    const environment = { ...process.env, GNUPGHOME: gpgHome };
    run('gpg', ['--batch', '--import'], {
      env: environment,
      input: process.env.LINUX_GPG_PRIVATE_KEY,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    const signingArguments = [
      '--batch',
      '--yes',
      '--pinentry-mode',
      'loopback',
      '--passphrase-fd',
      '0',
    ];
    if (process.env.LINUX_GPG_KEY_ID)
      signingArguments.push('--local-user', process.env.LINUX_GPG_KEY_ID);
    signingArguments.push('--armor', '--detach-sign', checksumFile);
    run('gpg', signingArguments, {
      env: environment,
      input: `${process.env.LINUX_GPG_PASSPHRASE}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    run('gpg', ['--verify', `${checksumFile}.asc`, checksumFile], { env: environment });
  } finally {
    fs.rmSync(gpgHome, { recursive: true, force: true });
  }
} else {
  console.warn('Unsigned preview: detached GPG signature was not created.');
}

console.log('Linux malware scan and checksums verified.');
