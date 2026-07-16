const fsp = require('node:fs/promises');
const path = require('node:path');
const { resolveInside } = require('../security.cjs');
const { normalizeRelative } = require('../projectManager.cjs');

const HISTORY_LIMIT = 6;

function registerWaveformIpc({ ipcMain, getWorkspace }) {
  ipcMain.handle('waveform:readLatest', async (event) => {
    const workspace = getWorkspace(event.sender);
    const projectRoot = workspace.captureProject();
    if (!workspace.latestVcdPath)
      workspace.latestVcdPath = await newestGeneratedFile(projectRoot, '.vcd');
    if (!workspace.latestVcdPath) throw new Error('No simulation waveform is available.');
    return readVcdInsideProject(projectRoot, workspace.latestVcdPath);
  });

  ipcMain.handle('waveform:listRuns', async (event) => {
    const workspace = getWorkspace(event.sender);
    if (!workspace.projectRoot) return [];
    const canonicalRoot = await fsp.realpath(workspace.projectRoot);
    const files = await recentGeneratedFiles(canonicalRoot, '.vcd', HISTORY_LIMIT);
    return Promise.all(files.map((file) => waveformMetadata(canonicalRoot, file)));
  });

  ipcMain.handle('waveform:readRun', async (event, runId) => {
    const projectRoot = getWorkspace(event.sender).captureProject();
    const relativePath = normalizeRelative(runId);
    if (path.extname(relativePath).toLowerCase() !== '.vcd')
      throw new Error('Only VCD waveform history can be opened.');
    return readVcdInsideProject(projectRoot, path.join(projectRoot, relativePath));
  });
}

async function waveformMetadata(canonicalRoot, file) {
  const canonical = resolveInside(canonicalRoot, await fsp.realpath(file.path));
  const stats = await fsp.stat(canonical);
  return {
    id: path.relative(canonicalRoot, canonical).replaceAll('\\', '/'),
    name: path.basename(path.dirname(canonical)),
    createdAt: file.modified,
    fileName: path.basename(canonical),
    size: stats.size,
  };
}

async function readVcdInsideProject(projectRoot, vcdPath) {
  const canonicalRoot = await fsp.realpath(projectRoot);
  const canonicalVcd = resolveInside(canonicalRoot, await fsp.realpath(vcdPath));
  return { name: path.basename(canonicalVcd), content: await fsp.readFile(canonicalVcd, 'utf8') };
}

async function recentGeneratedFiles(projectRoot, extension, limit) {
  const files = [];
  async function walk(directory) {
    let entries = [];
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (path.extname(entry.name).toLowerCase() === extension) {
        const stats = await fsp.stat(absolute);
        files.push({ path: absolute, modified: stats.mtimeMs });
      }
    }
  }
  await walk(path.join(projectRoot, '.openbench-runs'));
  await walk(path.join(projectRoot, '.rtlbench-runs'));
  return files.sort((a, b) => b.modified - a.modified).slice(0, limit);
}

async function newestGeneratedFile(projectRoot, extension) {
  return (await recentGeneratedFiles(projectRoot, extension, 1))[0]?.path || null;
}

module.exports = { HISTORY_LIMIT, registerWaveformIpc };
