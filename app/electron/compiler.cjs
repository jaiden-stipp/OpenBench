const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function locateIcarus(suiteRoot) {
  const executable =
    process.platform === 'win32'
      ? path.join(suiteRoot, 'bin', 'iverilog.exe')
      : path.join(suiteRoot, 'bin', 'iverilog');
  if (!fs.existsSync(executable)) return null;
  return {
    executable,
    baseArgs: ['-B', path.join(suiteRoot, 'lib', 'ivl')],
    env: {
      ...process.env,
      YOSYSHQ_ROOT: `${suiteRoot}${path.sep}`,
      PATH: `${path.join(suiteRoot, 'bin')}${path.delimiter}${path.join(suiteRoot, 'lib')}${path.delimiter}${process.env.PATH || ''}`,
    },
  };
}

function startIcarusCompile({
  projectRoot,
  files,
  suiteRoot,
  executableOverride,
  includePaths = [],
  topModule = '',
  onOutput = () => {},
}) {
  const portable = locateIcarus(suiteRoot);
  const executable = executableOverride || portable?.executable || 'iverilog';
  const args = [...(portable?.baseArgs || []), '-g2012', '-t', 'null'];
  for (const includePath of includePaths) args.push('-I', path.resolve(projectRoot, includePath));
  if (topModule) args.push('-s', topModule);
  args.push(...files);
  const child = spawn(executable, args, {
    cwd: projectRoot,
    windowsHide: true,
    env: portable?.env || process.env,
  });

  child.stdout.on('data', (data) => onOutput('stdout', data.toString()));
  child.stderr.on('data', (data) => onOutput('stderr', data.toString()));
  const completion = new Promise((resolve, reject) => {
    child.once('error', (error) =>
      reject(new Error(`Unable to start Icarus Verilog: ${error.message}`)),
    );
    child.once('close', (code) => resolve({ code: code ?? -1 }));
  });
  return { child, completion, command: [executable, ...args].join(' ') };
}

function startVerilatorLint({
  projectRoot,
  files,
  suiteRoot,
  includePaths = [],
  topModule = '',
  onOutput = () => {},
}) {
  const executable = path.join(
    suiteRoot,
    'bin',
    process.platform === 'win32' ? 'verilator_bin.exe' : 'verilator_bin',
  );
  if (!fs.existsSync(executable))
    throw new Error('Verilator was not found in the configured OSS CAD Suite.');
  const args = ['--lint-only', '--timing'];
  for (const includePath of includePaths) args.push(`-I${path.resolve(projectRoot, includePath)}`);
  if (topModule) args.push('--top-module', topModule);
  args.push(...files);
  const env = {
    ...process.env,
    VERILATOR_ROOT: path.join(suiteRoot, 'share', 'verilator'),
    YOSYSHQ_ROOT: `${suiteRoot}${path.sep}`,
    PATH: `${path.join(suiteRoot, 'bin')}${path.delimiter}${path.join(suiteRoot, 'lib')}${path.delimiter}${process.env.PATH || ''}`,
  };
  const child = spawn(executable, args, { cwd: projectRoot, windowsHide: true, env });
  child.stdout.on('data', (data) => onOutput('stdout', data.toString()));
  child.stderr.on('data', (data) => onOutput('stderr', data.toString()));
  const completion = new Promise((resolve, reject) => {
    child.once('error', (error) =>
      reject(new Error(`Unable to start Verilator: ${error.message}`)),
    );
    child.once('close', (code) => resolve({ code: code ?? -1 }));
  });
  return { child, completion, command: [executable, ...args].join(' ') };
}

module.exports = { locateIcarus, startIcarusCompile, startVerilatorLint };
