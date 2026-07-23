const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temporary, filePath);
}

function normalizeSession(value = {}) {
  const view = ['source', 'waveform', 'schematic'].includes(value.activeView)
    ? value.activeView
    : 'source';
  const openFiles = Array.isArray(value.openFiles)
    ? value.openFiles.filter((item) => typeof item === 'string').slice(0, 40)
    : [];
  return {
    version: 1,
    projectRoot: typeof value.projectRoot === 'string' ? value.projectRoot : '',
    openFiles,
    activeFile: typeof value.activeFile === 'string' ? value.activeFile : '',
    activeView: view,
    editorCursor:
      value.editorCursor && typeof value.editorCursor.path === 'string'
        ? {
            path: value.editorCursor.path,
            line: Math.max(1, Number(value.editorCursor.line) || 1),
            column: Math.max(1, Number(value.editorCursor.column) || 1),
          }
        : null,
    waveform: value.waveform && typeof value.waveform === 'object' ? value.waveform : null,
  };
}

function createSessionStore(baseDirectory, { legacyDirectories = [] } = {}) {
  const sessionPath = path.join(baseDirectory, 'session.json');
  const recoveryDirectory = path.join(baseDirectory, 'recovery');
  const draftName = (projectRoot, relativePath) =>
    `${crypto.createHash('sha256').update(`${projectRoot}\0${relativePath}`).digest('hex')}.json`;
  const draftPath = (projectRoot, relativePath) =>
    path.join(recoveryDirectory, draftName(projectRoot, relativePath));
  return {
    async loadSession() {
      const current = await readJson(sessionPath, null);
      if (current) return normalizeSession(current);
      for (const legacyDirectory of legacyDirectories) {
        const legacy = await readJson(path.join(legacyDirectory, 'session.json'), null);
        if (legacy) return normalizeSession(legacy);
      }
      return normalizeSession();
    },
    async saveSession(value) {
      const normalized = normalizeSession(value);
      await writeJsonAtomic(sessionPath, normalized);
      return normalized;
    },
    async loadDraft(projectRoot, relativePath) {
      let value = await readJson(draftPath(projectRoot, relativePath), null);
      for (const legacyDirectory of legacyDirectories) {
        if (value) break;
        value = await readJson(
          path.join(legacyDirectory, 'recovery', draftName(projectRoot, relativePath)),
          null,
        );
      }
      return value?.projectRoot === projectRoot &&
        value?.path === relativePath &&
        typeof value.content === 'string'
        ? value
        : null;
    },
    async saveDraft(projectRoot, relativePath, content) {
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024)
        throw new Error('Recovery drafts are limited to 8 MiB per file.');
      const value = {
        version: 1,
        projectRoot,
        path: relativePath,
        content,
        updatedAt: new Date().toISOString(),
      };
      await writeJsonAtomic(draftPath(projectRoot, relativePath), value);
      return value;
    },
    async clearDraft(projectRoot, relativePath) {
      await fsp.rm(draftPath(projectRoot, relativePath), { force: true });
    },
  };
}

module.exports = { createSessionStore, normalizeSession };
