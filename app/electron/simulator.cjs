const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { locateIcarus } = require('./compiler.cjs');

const execFileAsync = promisify(execFile);
const SIMULATION_ASSET_EXTENSIONS = new Set(['.bin', '.dat', '.hex', '.mem']);
const MAX_STAGED_ASSET_BYTES = 64 * 1024 * 1024;

async function mountSuite(suiteRoot) {
  if (process.platform !== 'win32') return { root: suiteRoot, cleanup: async () => {} };
  const candidates = ['R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Q', 'P'];
  for (const letter of candidates) {
    const drive = `${letter}:`;
    if (fs.existsSync(`${drive}\\`)) continue;
    try {
      await execFileAsync('subst.exe', [drive, suiteRoot], { windowsHide: true });
      return {
        root: `${drive}\\`,
        cleanup: async () => {
          try {
            await execFileAsync('subst.exe', [drive, '/D'], { windowsHide: true });
          } catch {}
        },
      };
    } catch {}
  }
  throw new Error('No temporary drive letter is available for the Windows OSS CAD Suite runtime.');
}

function runProcess(executable, args, options, onOutput) {
  const child = spawn(executable, args, { ...options, windowsHide: true });
  child.stdout.on('data', (data) => onOutput('stdout', data.toString()));
  child.stderr.on('data', (data) => onOutput('stderr', data.toString()));
  return new Promise((resolve, reject) => {
    child.once('error', (error) =>
      reject(new Error(`Unable to start ${path.basename(executable)}: ${error.message}`)),
    );
    child.once('close', (code) => resolve(code ?? -1));
  });
}

function compileBreakpointMonitor(breakpoints = []) {
  const normalized = breakpoints.map((breakpoint) => {
    const signalPath = String(breakpoint.signalPath || '').replace(/\s*\[[^\]]+\]\s*$/, '');
    const identifiers = signalPath.split('.');
    if (
      identifiers.length < 2 ||
      identifiers.some((identifier) => !/^[A-Za-z_$][\w$]*$/.test(identifier))
    )
      throw new Error(
        `Breakpoint signal path is not safe SystemVerilog hierarchy: ${breakpoint.signalPath}`,
      );
    const width = Math.max(1, Math.min(4096, Number(breakpoint.width) || 1));
    const value = String(breakpoint.value || '')
      .trim()
      .replaceAll('_', '');
    let literal;
    if (/^0b[01xz]+$/i.test(value)) literal = `${width}'b${value.slice(2)}`;
    else if (/^0x[0-9a-fxz]+$/i.test(value)) literal = `${width}'h${value.slice(2)}`;
    else if (/^[01xz]+$/i.test(value) && /[xz]/i.test(value)) literal = `${width}'b${value}`;
    else if (/^\d+$/.test(value)) literal = `${width}'d${value}`;
    else
      throw new Error(
        `Breakpoint value '${breakpoint.value}' must be decimal, 0b binary, 0x hexadecimal, or an X/Z bit pattern.`,
      );
    return { signalPath, width, value, literal, root: identifiers[0] };
  });
  if (!normalized.length) return { source: '', roots: [], normalized };
  const source = [
    '`timescale 1ns/1ps',
    'module rtlbench_breakpoint_monitor;',
    ...normalized.flatMap((breakpoint, index) => [
      `  always @(${breakpoint.signalPath}) begin`,
      `    if (${breakpoint.signalPath} === ${breakpoint.literal}) begin`,
      `      $display("[RTLBENCH_BREAKPOINT] ${breakpoint.signalPath} == ${breakpoint.value} at time %0t", $time);`,
      '      $finish;',
      '    end',
      '  end',
      index === normalized.length - 1 ? '' : '',
    ]),
    'endmodule',
    '',
  ].join('\n');
  return {
    source,
    roots: [...new Set(normalized.map((breakpoint) => breakpoint.root))],
    normalized,
  };
}

async function stageSimulationAssets(projectRoot, runDirectory) {
  let stagedBytes = 0;
  const visit = async (directory, relativeDirectory = '') => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.openbench-runs' || entry.name === '.rtlbench-runs') continue;
      const relative = path.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, relative);
        continue;
      }
      if (
        !entry.isFile() ||
        !SIMULATION_ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      )
        continue;
      const stat = await fsp.stat(absolute);
      stagedBytes += stat.size;
      if (stagedBytes > MAX_STAGED_ASSET_BYTES)
        throw new Error(
          'Simulation data files exceed the 64 MB staging limit. Keep only the required .hex, .mem, .bin, or .dat files in the project, or reduce their size.',
        );
      const destination = path.join(runDirectory, relative);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(absolute, destination);
    }
  };
  await visit(projectRoot);
}

async function createTraceMonitor(runDirectory, topModule, absoluteFiles) {
  if (!/^[A-Za-z_$][\w$]*$/.test(topModule || '')) return null;
  const contents = await Promise.all(absoluteFiles.map((file) => fsp.readFile(file, 'utf8')));
  if (contents.some((content) => /\$dumpvars\s*\(/.test(content))) return null;
  const monitorPath = path.join(runDirectory, 'openbench_trace_monitor.sv');
  await fsp.writeFile(
    monitorPath,
    `module openbench_trace_monitor;\n  initial begin\n    $dumpfile("openbench.vcd");\n    $dumpvars(0, ${topModule});\n  end\nendmodule\n`,
    'utf8',
  );
  return monitorPath;
}

async function runIcarusSimulation({
  projectRoot,
  files,
  suiteRoot,
  includePaths = [],
  topModule = '',
  breakpoints = [],
  onOutput = () => {},
}) {
  const mount = await mountSuite(suiteRoot);
  try {
    const portable = locateIcarus(mount.root);
    if (!portable) throw new Error('Portable Icarus Verilog was not found.');
    const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const runDirectory = path.join(projectRoot, '.openbench-runs', runId);
    await fsp.mkdir(runDirectory, { recursive: true });
    await stageSimulationAssets(projectRoot, runDirectory);
    const bytecode = path.join(runDirectory, 'simulation.vvp');
    const absoluteFiles = files.map((file) => path.resolve(projectRoot, file));
    const compileArgs = [...portable.baseArgs, '-g2012', '-o', bytecode];
    for (const includePath of includePaths)
      compileArgs.push('-I', path.resolve(projectRoot, includePath));
    const monitor = compileBreakpointMonitor(breakpoints);
    const traceMonitorPath = await createTraceMonitor(runDirectory, topModule, absoluteFiles);
    if (topModule) compileArgs.push('-s', topModule);
    else for (const root of monitor.roots) compileArgs.push('-s', root);
    if (monitor.source) compileArgs.push('-s', 'rtlbench_breakpoint_monitor');
    if (traceMonitorPath) compileArgs.push('-s', 'openbench_trace_monitor');
    compileArgs.push(...absoluteFiles);
    if (monitor.source) {
      const monitorPath = path.join(runDirectory, 'rtlbench_breakpoints.sv');
      await fsp.writeFile(monitorPath, monitor.source, 'utf8');
      compileArgs.push(monitorPath);
    }
    if (traceMonitorPath) compileArgs.push(traceMonitorPath);

    onOutput('stdout', `$ ${portable.executable} ${compileArgs.join(' ')}\n`);
    const compileCode = await runProcess(
      portable.executable,
      compileArgs,
      { cwd: projectRoot, env: portable.env },
      onOutput,
    );
    if (compileCode !== 0)
      throw new Error(`Simulation compile failed with exit code ${compileCode}.`);

    const vvp = path.join(mount.root, 'bin', process.platform === 'win32' ? 'vvp.exe' : 'vvp');
    onOutput('stdout', `$ ${vvp} ${bytecode}\n`);
    let breakpointHit = null;
    let breakpointOutput = '';
    const captureOutput = (stream, text) => {
      breakpointOutput = `${breakpointOutput}${text}`.slice(-4096);
      const match = breakpointOutput.match(/\[RTLBENCH_BREAKPOINT\]\s+(.+?)\s+at time\s+(\d+)/);
      if (match) breakpointHit = { condition: match[1], time: Number(match[2]) };
      onOutput(stream, text);
    };
    const simulationCode = await runProcess(
      vvp,
      [bytecode],
      { cwd: runDirectory, env: portable.env },
      captureOutput,
    );
    if (simulationCode !== 0)
      throw new Error(`Simulation failed with exit code ${simulationCode}.`);

    const entries = await fsp.readdir(runDirectory, { withFileTypes: true });
    const vcdFiles = entries.filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.vcd'),
    );
    if (!vcdFiles.length)
      throw new Error(
        'Simulation completed successfully but produced no VCD file. Add $dumpfile and $dumpvars to the testbench.',
      );
    const candidates = await Promise.all(
      vcdFiles.map(async (entry) => {
        const filePath = path.join(runDirectory, entry.name);
        const stat = await fsp.stat(filePath);
        return { filePath, modified: stat.mtimeMs };
      }),
    );
    candidates.sort((a, b) => b.modified - a.modified);
    return { code: 0, runDirectory, vcdPath: candidates[0].filePath, breakpointHit };
  } finally {
    await mount.cleanup();
  }
}

async function runVerilatorSimulation({
  projectRoot,
  files,
  suiteRoot,
  includePaths = [],
  topModule = '',
  onOutput = () => {},
}) {
  const mount = await mountSuite(suiteRoot);
  try {
    const runId = `verilator-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
    const runDirectory = path.join(projectRoot, '.openbench-runs', runId);
    const objectDirectory = path.join(runDirectory, 'obj_dir');
    await fsp.mkdir(runDirectory, { recursive: true });
    const executable = path.join(
      mount.root,
      'bin',
      process.platform === 'win32' ? 'verilator_bin.exe' : 'verilator_bin',
    );
    const outputName = process.platform === 'win32' ? 'rtlbench_sim.exe' : 'rtlbench_sim';
    const args = ['--binary', '--timing', '--trace', '--Mdir', objectDirectory, '-o', outputName];
    for (const includePath of includePaths)
      args.push(`-I${path.resolve(projectRoot, includePath)}`);
    if (topModule) args.push('--top-module', topModule);
    args.push(...files.map((file) => path.resolve(projectRoot, file)));
    const env = {
      ...process.env,
      VERILATOR_ROOT: path.join(mount.root, 'share', 'verilator'),
      YOSYSHQ_ROOT: mount.root,
      PATH: `${path.join(mount.root, 'bin')}${path.delimiter}${path.join(mount.root, 'lib')}${path.delimiter}${process.env.PATH || ''}`,
    };
    onOutput('stdout', `$ ${executable} ${args.join(' ')}\n`);
    const compileCode = await runProcess(executable, args, { cwd: runDirectory, env }, onOutput);
    if (compileCode !== 0)
      throw new Error(
        `Verilator build failed with exit code ${compileCode}. A supported C++ compiler and Make-compatible build tool are required.`,
      );
    const simulationExecutable = path.join(objectDirectory, outputName);
    const simulationCode = await runProcess(
      simulationExecutable,
      [],
      { cwd: runDirectory, env },
      onOutput,
    );
    if (simulationCode !== 0)
      throw new Error(`Verilator simulation failed with exit code ${simulationCode}.`);
    const entries = await fsp.readdir(runDirectory, { withFileTypes: true });
    const vcdFile = entries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.vcd'),
    );
    if (!vcdFile)
      throw new Error(
        'Verilator simulation completed without producing a VCD. Add $dumpfile/$dumpvars and enable trace generation.',
      );
    return { code: 0, runDirectory, vcdPath: path.join(runDirectory, vcdFile.name) };
  } finally {
    await mount.cleanup();
  }
}

module.exports = {
  compileBreakpointMonitor,
  createTraceMonitor,
  mountSuite,
  runIcarusSimulation,
  runVerilatorSimulation,
  stageSimulationAssets,
};
