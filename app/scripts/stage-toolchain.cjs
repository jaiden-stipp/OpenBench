const fsp = require('node:fs/promises');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(
  process.env.OPENBENCH_TOOLCHAIN_SOURCE ||
    process.env.RTLBENCH_TOOLCHAIN_SOURCE ||
    path.join(appRoot, '..', '.toolchain', 'oss-cad-suite'),
);
const targetRoot = path.join(appRoot, '.openbench-toolchain', 'oss-cad-suite');

async function copyFile(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(source, target);
}

async function copyDirectory(relativePath) {
  await fsp.cp(path.join(sourceRoot, relativePath), path.join(targetRoot, relativePath), {
    recursive: true,
  });
}

async function stage() {
  const executableSuffix = process.platform === 'win32' ? '.exe' : '';
  const binaries = [
    `iverilog${executableSuffix}`,
    `vvp${executableSuffix}`,
    `verilator_bin${executableSuffix}`,
    `yosys${executableSuffix}`,
    `yosys-abc${executableSuffix}`,
  ];
  await fsp.rm(targetRoot, { recursive: true, force: true });
  await Promise.all(binaries.map((name) => copyFile(path.join('bin', name))));
  if (process.platform === 'win32') {
    const binEntries = await fsp.readdir(path.join(sourceRoot, 'bin'), { withFileTypes: true });
    await Promise.all(
      binEntries
        .filter((entry) => entry.isFile() && /\.dll$/i.test(entry.name))
        .map((entry) => copyFile(path.join('bin', entry.name))),
    );
  }
  await Promise.all(['lib/ivl', 'share/verilator', 'share/yosys'].map(copyDirectory));
  if (process.platform !== 'win32')
    await Promise.all(
      ['iverilog', 'ivl', 'ivlpp', 'vhdlpp', 'vvp', 'verilator_bin', 'yosys', 'yosys-abc'].map(
        (name) => copyFile(path.join('libexec', name)),
      ),
    );
  for (const name of ['VERSION', 'README']) {
    try {
      await copyFile(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  try {
    await copyDirectory('license');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const libraryEntries = await fsp.readdir(path.join(sourceRoot, 'lib'), { withFileTypes: true });
  const runtimeLibrary =
    process.platform === 'win32'
      ? /\.dll$/i
      : process.platform === 'darwin'
        ? /\.dylib(?:\.\d+)*$/i
        : /\.so(?:\.\d+)*$/i;
  await Promise.all(
    libraryEntries
      .filter(
        (entry) => (entry.isFile() || entry.isSymbolicLink()) && runtimeLibrary.test(entry.name),
      )
      .map((entry) => copyFile(path.join('lib', entry.name))),
  );
  const files = [];
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push((await fsp.stat(absolute)).size);
    }
  }
  await walk(targetRoot);
  const bytes = files.reduce((sum, size) => sum + size, 0);
  process.stdout.write(
    `Staged ${files.length} backend files (${(bytes / 1024 / 1024).toFixed(1)} MiB) at ${targetRoot}\n`,
  );
}

stage().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
