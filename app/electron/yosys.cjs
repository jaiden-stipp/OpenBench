const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { mountSuite } = require('./simulator.cjs');

function quoteYosys(value) {
  return `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`;
}

function runProcess(executable, args, options, onOutput) {
  const child = spawn(executable, args, { ...options, windowsHide: true });
  child.stdout.on('data', (data) => onOutput('stdout', data.toString()));
  child.stderr.on('data', (data) => onOutput('stderr', data.toString()));
  return new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`Unable to start Yosys: ${error.message}`)));
    child.once('close', (code) => resolve(code ?? -1));
  });
}

async function runYosysElaboration({
  projectRoot,
  files,
  suiteRoot,
  topModule,
  includePaths = [],
  onOutput = () => {},
}) {
  if (!files.length)
    throw new Error('No synthesizable Verilog/SystemVerilog source files were selected.');
  const mount = await mountSuite(suiteRoot);
  try {
    const runId = `yosys-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
    const runDirectory = path.join(projectRoot, '.openbench-runs', runId);
    await fsp.mkdir(runDirectory, { recursive: true });
    const jsonPath = path.join(runDirectory, 'netlist.json');
    const scriptPath = path.join(runDirectory, 'elaborate.ys');
    const stagedIncludes = [];
    for (const [index, includePath] of includePaths.entries()) {
      const source = path.resolve(projectRoot, includePath);
      const stat = await fsp.stat(source).catch(() => null);
      if (!stat?.isDirectory())
        throw new Error(`Yosys include path is not a directory: ${includePath}`);
      const relativeTarget = path.join('includes', String(index));
      await fsp.cp(source, path.join(runDirectory, relativeTarget), { recursive: true });
      stagedIncludes.push(relativeTarget.replaceAll('\\', '/'));
    }
    const absoluteFiles = files.map((file) => path.resolve(projectRoot, file));
    const hierarchy = topModule
      ? `hierarchy -check -top ${topModule}`
      : 'hierarchy -check -auto-top';
    const script = [
      ...stagedIncludes.map((includePath) => `verilog_defaults -add -I${includePath}`),
      `read_verilog -sv ${absoluteFiles.map(quoteYosys).join(' ')}`,
      hierarchy,
      'proc',
      'write_json netlist.json',
      '',
    ].join('\n');
    await fsp.writeFile(scriptPath, script, 'utf8');
    const yosys = path.join(
      mount.root,
      'bin',
      process.platform === 'win32' ? 'yosys.exe' : 'yosys',
    );
    const env = {
      ...process.env,
      YOSYSHQ_ROOT: mount.root,
      PATH: `${path.join(mount.root, 'bin')}${path.delimiter}${path.join(mount.root, 'lib')}${path.delimiter}${process.env.PATH || ''}`,
    };
    onOutput('stdout', `$ ${yosys} -s ${scriptPath}\n`);
    const code = await runProcess(
      yosys,
      ['-s', 'elaborate.ys'],
      { cwd: runDirectory, env },
      onOutput,
    );
    if (code !== 0) throw new Error(`Yosys elaboration failed with exit code ${code}.`);
    const netlist = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
    const modules = Object.entries(netlist.modules || {});
    const top =
      modules.find(
        ([, module]) => module.attributes?.top === '00000000000000000000000000000001',
      )?.[0] || modules[0]?.[0];
    if (!top) throw new Error('Yosys JSON contains no modules.');
    return { code: 0, jsonPath, top, moduleCount: modules.length };
  } finally {
    await mount.cleanup();
  }
}

module.exports = { quoteYosys, runYosysElaboration };
