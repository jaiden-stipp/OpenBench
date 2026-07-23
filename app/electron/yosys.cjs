const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { mountSuite } = require('./simulator.cjs');

const hdlStructure = import('../shared/hdlStructure.js');

function quoteYosys(value) {
  return `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`;
}

function quoteSlangArgument(value) {
  return JSON.stringify(value.replaceAll('\\', '/'));
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

function normalizeNetlistSources(value, projectRoot, runDirectory) {
  if (!value || typeof value !== 'object') return value;
  if (typeof value.attributes?.src === 'string')
    value.attributes.src = value.attributes.src
      .split('|')
      .map((location) => {
        const match = location.match(/^(.*):(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)$/);
        if (!match) return location;
        const absolute = path.resolve(runDirectory, match[1]);
        const relative = path.relative(projectRoot, absolute);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return location;
        return `${relative.replaceAll('\\', '/')}:${match[2]}`;
      })
      .join('|');
  for (const child of Object.values(value))
    normalizeNetlistSources(child, projectRoot, runDirectory);
  return value;
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
  if (topModule && !/^[A-Za-z_$][\w$]*$/.test(topModule))
    throw new Error(`Invalid RTL top module name: ${topModule}`);
  const mount = await mountSuite(suiteRoot);
  try {
    const runId = `yosys-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
    const runDirectory = path.join(projectRoot, '.rtldeck-runs', runId);
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
    const sourceContents = await Promise.all(
      absoluteFiles.map((file) => fsp.readFile(file, 'utf8')),
    );
    const { parsePackageReferences } = await hdlStructure;
    const needsSlang = sourceContents.some(
      (content) => parsePackageReferences(content).declarations.length > 0,
    );
    const slangPlugin = path.join(suiteRoot, 'share', 'yosys', 'plugins', 'slang.so');
    if (needsSlang && !(await fsp.stat(slangPlugin).catch(() => null)))
      throw new Error(
        'This design uses SystemVerilog packages, but the bundled Yosys slang frontend is unavailable.',
      );
    let slangCommandFile = null;
    if (needsSlang) {
      slangCommandFile = path.join(runDirectory, 'slang-files.f');
      const commandFile = [
        '--single-unit',
        '--ignore-timing',
        '--ignore-initial',
        ...(topModule ? ['--top', quoteSlangArgument(topModule)] : []),
        ...stagedIncludes.flatMap((includePath) => ['-I', quoteSlangArgument(includePath)]),
        ...absoluteFiles.map((file) => quoteSlangArgument(path.relative(runDirectory, file))),
        '',
      ].join('\n');
      await fsp.writeFile(slangCommandFile, commandFile, 'utf8');
    }
    const hierarchy = topModule
      ? `hierarchy -check -top ${topModule}`
      : 'hierarchy -check -auto-top';
    const frontendCommands = needsSlang
      ? ['plugin -i slang', `read_slang -f ${path.basename(slangCommandFile)}`]
      : [
          ...stagedIncludes.map((includePath) => `verilog_defaults -add -I${includePath}`),
          `read_verilog -sv ${absoluteFiles.map(quoteYosys).join(' ')}`,
        ];
    const script = [...frontendCommands, hierarchy, 'proc', 'write_json netlist.json', ''].join(
      '\n',
    );
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
    const netlist = normalizeNetlistSources(
      JSON.parse(await fsp.readFile(jsonPath, 'utf8')),
      projectRoot,
      runDirectory,
    );
    await fsp.writeFile(jsonPath, JSON.stringify(netlist), 'utf8');
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

module.exports = {
  normalizeNetlistSources,
  quoteSlangArgument,
  quoteYosys,
  runYosysElaboration,
};
