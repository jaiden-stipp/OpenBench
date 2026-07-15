const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_SETTINGS = Object.freeze({
  topModule: '',
  simulationTop: '',
  includePaths: [],
  simulator: 'iverilog',
  toolchainPath: '',
});

function normalizeSettings(value = {}) {
  return {
    topModule: typeof value.topModule === 'string' ? value.topModule.trim() : '',
    simulationTop: typeof value.simulationTop === 'string' ? value.simulationTop.trim() : '',
    includePaths: Array.isArray(value.includePaths) ? value.includePaths.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [],
    simulator: value.simulator === 'verilator' ? 'verilator' : 'iverilog',
    toolchainPath: typeof value.toolchainPath === 'string' ? value.toolchainPath.trim() : '',
  };
}

async function loadProjectSettings(projectRoot) {
  try {
    const value = JSON.parse(await fsp.readFile(path.join(projectRoot, '.rtlbench.json'), 'utf8'));
    return normalizeSettings(value);
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    throw new Error(`Unable to read .rtlbench.json: ${error.message}`);
  }
}

async function saveProjectSettings(projectRoot, value) {
  const settings = normalizeSettings(value);
  await fsp.writeFile(path.join(projectRoot, '.rtlbench.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}

module.exports = { DEFAULT_SETTINGS, loadProjectSettings, normalizeSettings, saveProjectSettings };
