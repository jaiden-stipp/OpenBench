const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(appRoot, 'release');

function windowsPowerShell(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function findReleaseExecutables() {
  const installer = fs
    .readdirSync(releaseRoot)
    .filter((name) => name.endsWith('.exe'))
    .map((name) => path.join(releaseRoot, name));
  const unpackedApp = path.join(releaseRoot, 'win-unpacked', 'OpenBench.exe');
  if (fs.existsSync(unpackedApp)) installer.push(unpackedApp);
  return installer;
}

function verifySignature(file) {
  const result = windowsPowerShell(
    [
      `$signature = Get-AuthenticodeSignature -LiteralPath ${quotePowerShell(file)}`,
      "if ($signature.Status -ne 'Valid') {",
      '  Write-Error "Invalid Authenticode signature: $($signature.Status) $($signature.StatusMessage)"',
      '  exit 1',
      '}',
      'Write-Output $signature.SignerCertificate.Subject',
    ].join('; '),
  );
  console.log(`Valid Authenticode signature: ${path.basename(file)} (${result.trim()})`);
}

function scanWithDefender(target) {
  windowsPowerShell(
    [
      "$command = Join-Path $env:ProgramFiles 'Windows Defender\\MpCmdRun.exe'",
      'if (-not (Test-Path $command)) {',
      '  $command = Get-ChildItem "$env:ProgramData\\Microsoft\\Windows Defender\\Platform\\*\\MpCmdRun.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName',
      '}',
      "if (-not $command) { Write-Error 'Microsoft Defender command-line scanner is unavailable'; exit 1 }",
      `& $command -Scan -ScanType 3 -File ${quotePowerShell(target)} -DisableRemediation`,
      'if ($LASTEXITCODE -ne 0) { Write-Error "Defender scan failed or detected a threat (exit $LASTEXITCODE)"; exit $LASTEXITCODE }',
    ].join('; '),
  );
  console.log(`Microsoft Defender scan passed: ${target}`);
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (process.platform !== 'win32')
  throw new Error('Windows release verification must run on Windows.');
if (!fs.existsSync(releaseRoot))
  throw new Error(`Release directory does not exist: ${releaseRoot}`);

const executables = findReleaseExecutables();
if (executables.length < 2) {
  throw new Error('Expected both the NSIS installer and unpacked OpenBench executable.');
}

for (const executable of executables) verifySignature(executable);
scanWithDefender(path.join(releaseRoot, 'win-unpacked'));
for (const installer of executables.filter((file) => path.dirname(file) === releaseRoot)) {
  scanWithDefender(installer);
}

const checksums = executables
  .filter((file) => path.dirname(file) === releaseRoot)
  .map((file) => `${sha256(file)}  ${path.basename(file)}`)
  .join('\n');
fs.writeFileSync(path.join(releaseRoot, 'SHA256SUMS.txt'), `${checksums}\n`, 'utf8');
console.log('Windows release verification passed and SHA256SUMS.txt was written.');
