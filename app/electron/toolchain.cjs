const fs = require('node:fs');
const path = require('node:path');

function resolveToolchainRoot({
  projectRoot,
  configuredPath = '',
  resourcesPath = process.resourcesPath,
  env = process.env,
  appDirectory = __dirname,
}) {
  const candidates = [
    configuredPath && path.resolve(projectRoot, configuredPath),
    env.OPENBENCH_TOOLCHAIN && path.resolve(env.OPENBENCH_TOOLCHAIN),
    env.RTLBENCH_TOOLCHAIN && path.resolve(env.RTLBENCH_TOOLCHAIN),
    resourcesPath && path.join(resourcesPath, 'oss-cad-suite'),
    path.resolve(appDirectory, '..', '..', 'toolchain', 'oss-cad-suite'),
  ].filter(Boolean);
  const root = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'bin')));
  if (root) return root;
  throw new Error(
    'OSS CAD Suite was not found. Set its extracted folder in Project Settings or set OPENBENCH_TOOLCHAIN.',
  );
}

module.exports = { resolveToolchainRoot };
