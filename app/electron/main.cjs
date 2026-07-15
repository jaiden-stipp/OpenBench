const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveInside } = require('./security.cjs');
const { startIcarusCompile, startVerilatorLint } = require('./compiler.cjs');
const { runIcarusSimulation, runVerilatorSimulation } = require('./simulator.cjs');
const { runYosysElaboration } = require('./yosys.cjs');
const { loadProjectSettings, saveProjectSettings } = require('./settings.cjs');
const { resolveToolchainRoot } = require('./toolchain.cjs');
const { generateStarterTestbench } = require('./testbenchGenerator.cjs');
const { createErrorTranslator, formatTranslation } = require('./errorTranslator.cjs');
const {
  activateProject,
  createFile,
  createFolder,
  createProject,
  discoverHdlFiles,
  duplicateFile,
  importFiles,
  loadManifest,
  normalizeRelative,
  projectData,
  removeEntry,
  renameEntry,
  saveManifest,
} = require('./projectManager.cjs');
const { createSessionStore } = require('./sessionStore.cjs');
const { ensureExampleProject } = require('./exampleProject.cjs');
const { createSupportBundle, runBackendSelfTest } = require('./support.cjs');

const HDL_EXTENSIONS = new Set(['.v', '.sv', '.vh', '.svh']);
const TEST_PROJECT = process.env.OPENBENCH_TEST_PROJECT || process.env.RTLBENCH_TEST_PROJECT;
const TEST_ACTION =
  process.env.OPENBENCH_TEST_ACTION || process.env.RTLBENCH_TEST_ACTION || 'simulation';
const CAPTURE_PATH = process.env.OPENBENCH_CAPTURE_PATH || process.env.RTLBENCH_CAPTURE_PATH;
const DEV_URL = process.env.OPENBENCH_DEV_URL || process.env.RTLBENCH_DEV_URL;
const IVERILOG_OVERRIDE = process.env.OPENBENCH_IVERILOG || process.env.RTLBENCH_IVERILOG;
let activeProject = TEST_PROJECT ? path.resolve(TEST_PROJECT) : null;
let compileProcess = null;
let lintProcess = null;
let simulationRunning = false;
let latestVcdPath = null;
let rtlRunning = false;
let latestNetlistPath = null;

if (CAPTURE_PATH)
  app.setPath('userData', path.join(path.dirname(CAPTURE_PATH), '.electron-validation'));
const sessionStore = createSessionStore(path.join(app.getPath('userData'), 'openbench-state'));

function createWindow() {
  const win = new BrowserWindow({
    title: 'OpenBench',
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#10151d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = DEV_URL;
  const entryFile = path.join(__dirname, '..', 'dist', 'index.html');
  const allowedUrl = devUrl || pathToFileURL(entryFile).href;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(allowedUrl)) event.preventDefault();
  });

  if (CAPTURE_PATH) {
    win.webContents.once('did-finish-load', async () => {
      try {
        if (TEST_PROJECT) {
          const testAction = TEST_ACTION;
          if (!['tutorial', 'tutorial-light'].includes(testAction))
            await win.webContents.executeJavaScript(
              `document.querySelector('.onboarding-top button')?.click(); true;`,
            );
          if (testAction === 'tutorial' || testAction === 'tutorial-light') {
            await win.webContents.executeJavaScript(
              `new Promise((resolve, reject) => { const started = Date.now(); const check = () => { if (document.querySelector('.onboarding-dialog')) { ${testAction === 'tutorial-light' ? 'document.querySelector(\'[data-testid="theme-toggle"]\')?.click();' : ''} resolve(true); } else if (Date.now() - started > 5000) reject(new Error('tutorial unavailable')); else setTimeout(check, 100); }; check(); });`,
            );
          } else if (testAction === 'newproject') {
            await win.webContents.executeJavaScript(`
              window.dispatchEvent(new CustomEvent('openbench:show-new-project', { detail: 'C:\\\\Users\\\\Student\\\\Documents' }));
              new Promise((resolve, reject) => { const started = Date.now(); const check = () => { if (document.querySelector('.project-dialog')) resolve(true); else if (Date.now() - started > 5000) reject(new Error('new project dialog unavailable')); else setTimeout(check, 100); }; check(); });
            `);
          } else if (testAction === 'import') {
            await win.webContents.executeJavaScript(`
              window.dispatchEvent(new CustomEvent('openbench:show-import', { detail: { root: 'C:\\\\Users\\\\Student\\\\Documents\\\\traffic-light', name: 'traffic-light', candidates: ['rtl/traffic_light.sv', 'rtl/timer.sv', 'sim/traffic_light_tb.sv', 'notes/experimental.sv'], selected: ['rtl/traffic_light.sv', 'sim/traffic_light_tb.sv'] } }));
              new Promise((resolve, reject) => { const started = Date.now(); const check = () => { if (document.querySelector('.project-file-picker')) resolve(true); else if (Date.now() - started > 5000) reject(new Error('import dialog unavailable')); else setTimeout(check, 100); }; check(); });
            `);
          } else if (testAction === 'menu') {
            await win.webContents.executeJavaScript(`
              document.querySelector('.app-menu-item > button')?.click();
              new Promise((resolve, reject) => { const started = Date.now(); const check = () => { if (document.querySelector('.app-menu-dropdown')) resolve(true); else if (Date.now() - started > 5000) reject(new Error('application menu unavailable')); else setTimeout(check, 100); }; check(); });
            `);
          } else if (testAction === 'context') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 7000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => document.querySelector('.tree-file'), 'project file unavailable').then((button) => button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 150, clientY: 140 }))).then(() => waitFor(() => document.querySelector('.project-context-menu'), 'project context menu unavailable'));
            `);
          } else if (testAction === 'help') {
            await win.webContents.executeJavaScript(`
              document.querySelector('[data-testid="open-help"]')?.click();
              new Promise((resolve, reject) => { const started = Date.now(); const check = () => { if (document.querySelector('.help-dialog')) resolve(true); else if (Date.now() - started > 5000) reject(new Error('help unavailable')); else setTimeout(check, 100); }; check(); });
            `);
          } else if (testAction === 'concept') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 12000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => [...document.querySelectorAll('.tree-file')].find((button) => button.textContent.includes('traffic_light.sv') && !button.textContent.includes('_tb')), 'source file unavailable').then((button) => button.click()).then(() => waitFor(() => document.querySelector('.monaco-editor'), 'source editor unavailable')).then(() => new Promise((resolve) => setTimeout(resolve, 500))).then(() => { window.dispatchEvent(new CustomEvent('rtlbench:show-concept', { detail: { line: 15, column: 8 } })); }).then(() => waitFor(() => document.querySelector('.source-concept-card'), 'concept card unavailable'));
            `);
          } else if (testAction === 'xzhelp') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 20000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'simulation unavailable').then((button) => button.click()).then(() => waitFor(() => document.querySelector('.logic-help-button'), 'X/Z help unavailable')).then((button) => button.click()).then(() => waitFor(() => document.querySelector('.logic-explanation'), 'X/Z explanation unavailable'));
            `);
          } else if (testAction === 'error') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 15000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => { const button = document.querySelector('[data-testid="run-compile"]'); return button && !button.disabled && button; }, 'compile unavailable').then((button) => button.click()).then(() => waitFor(() => document.querySelector('.console-line.translated'), 'translation unavailable'));
            `);
          } else if (testAction === 'starter') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 20000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => { const button = document.querySelector('[data-testid="run-rtl"]'); return button && !button.disabled && button; }, 'RTL unavailable').then((button) => button.click()).then(() => waitFor(() => document.querySelector('[data-testid="starter-testbench"]'), 'starter action unavailable')).then((button) => button.click()).then(() => waitFor(() => document.querySelector('.monaco-editor') && document.querySelector('footer')?.textContent.includes('_tb.sv'), 'generated testbench unavailable'));
            `);
          } else if (testAction === 'breakpoint') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 25000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'simulation unavailable').then((button) => button.click()).then(() => waitFor(() => [...document.querySelectorAll('.signal-row')].find((row) => row.querySelector('.signal-name')?.textContent.includes('dut.total')), 'total waveform unavailable')).then((row) => row.querySelector('.breakpoint-button').click()).then(() => waitFor(() => document.querySelector('.breakpoint-editor input'), 'condition editor unavailable')).then((input) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '3'); input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.breakpoint-editor button').click(); }).then(() => waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'second simulation unavailable')).then((button) => button.click()).then(() => waitFor(() => document.querySelector('footer')?.textContent.includes('Stopped at'), 'compiled stop did not fire'));
            `);
          } else if (testAction === 'watch') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 25000) => new Promise((resolve, reject) => { const started = Date.now(); const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); }; check(); });
              waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'simulation unavailable')
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('.waveform-panel canvas'), 'waveform unavailable'))
                .then(() => { document.querySelector('[data-testid="watch-toggle"]').click(); [...document.querySelectorAll('.tree-file')].find((button) => button.textContent.includes('watch_counter.sv') && !button.textContent.includes('_tb'))?.click(); })
                .then(() => waitFor(() => document.querySelector('.monaco-editor textarea'), 'source editor unavailable'))
                .then((textarea) => { window.__rtlbenchBeforeWatch = document.querySelector('.console')?.textContent || ''; textarea.focus(); window.dispatchEvent(new CustomEvent('rtlbench:insert-editor-text', { detail: String.fromCharCode(10) + '// Saved by the OpenBench watch-mode validation.' })); })
                .then(() => waitFor(() => { const button = document.querySelector('[data-testid="save-file"]'); return button && !button.disabled && button; }, 'save did not become available'))
                .then((button) => button.click())
                .then(() => waitFor(() => { const text = document.querySelector('.console')?.textContent || ''; return text !== window.__rtlbenchBeforeWatch && text.includes('Simulation finished with exit code 0'); }, 'watch rerun did not finish'))
                .then(() => { [...document.querySelectorAll('.view-tabs button')].find((button) => button.textContent.startsWith('Waveform'))?.click(); return true; });
            `);
          } else if (testAction === 'settings') {
            await win.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => {
                  const button = document.querySelector('[data-testid="open-settings"]');
                  if (button && !button.disabled) { button.click(); resolve(true); }
                  else if (Date.now() - started > 10000) reject(new Error('settings unavailable'));
                  else setTimeout(check, 100);
                };
                check();
              }).then(() => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => {
                  if (document.querySelector('.settings-dialog')) resolve(true);
                  else if (Date.now() - started > 5000) reject(new Error('settings dialog unavailable'));
                  else setTimeout(check, 100);
                };
                check();
              }));
            `);
          } else if (testAction === 'phase4') {
            await win.webContents.executeJavaScript(`
              const change = (selector, value) => { const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); };
              change('[aria-label="Explorer dock"]', 'right');
              change('[aria-label="Console dock"]', 'right');
              document.querySelector('[data-testid="theme-toggle"]')?.click();
              new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => {
                  const button = document.querySelector('[data-testid="run-rtl"]');
                  if (button && !button.disabled) { button.click(); resolve(true); }
                  else if (Date.now() - started > 10000) reject(new Error('RTL action unavailable'));
                  else setTimeout(check, 100);
                };
                check();
              }).then(() => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => {
                  if (document.querySelector('.schematic-panel svg')) resolve(true);
                  else if (Date.now() - started > 20000) reject(new Error('schematic unavailable'));
                  else setTimeout(check, 100);
                };
                check();
              }));
            `);
          } else if (testAction === 'example' || testAction === 'readme-example') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 25000) => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); };
                check();
              });
              [...document.querySelectorAll('.app-menu-item > button')].find((button) => button.textContent === 'Help')?.click();
              waitFor(() => [...document.querySelectorAll('.app-menu-dropdown button')].find((button) => button.textContent.includes('Open Example Project')), 'example menu unavailable')
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('footer')?.textContent.includes('Example ready'), 'example project unavailable'))
                .then(() => waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'example simulation unavailable'))
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('.waveform-panel canvas'), 'example waveform unavailable'))
                .then(() => { if (${testAction === 'readme-example'}) { document.querySelector('.console-panel')?.remove(); document.querySelector('.center-column > .splitter')?.remove(); const center = document.querySelector('.center-column'); if (center) { center.style.gridTemplateRows = 'minmax(0, 1fr)'; center.style.gridTemplateAreas = '"editor"'; } const footer = document.querySelector('footer span:first-child'); if (footer) footer.textContent = 'Getting Started Counter'; } });
            `);
          } else if (testAction === 'inline-lint') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 25000) => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); };
                check();
              });
              waitFor(() => document.querySelector('.tree-file'), 'lint file unavailable')
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('.monaco-editor textarea'), 'lint editor unavailable'))
                .then((textarea) => { textarea.focus(); window.dispatchEvent(new CustomEvent('rtlbench:insert-editor-text', { detail: String.fromCharCode(10) + 'this is not valid verilog' })); })
                .then(() => waitFor(() => document.querySelector('.lint-state.issues'), 'inline lint did not report the edit'));
            `);
          } else if (testAction === 'session-setup') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 25000) => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); };
                check();
              });
              waitFor(() => document.querySelectorAll('.tree-file').length >= 2 && document.querySelectorAll('.tree-file'), 'session files unavailable')
                .then((files) => { files[0].click(); files[1].click(); })
                .then(() => waitFor(() => document.querySelectorAll('.file-tabs > button').length >= 2, 'source tabs unavailable'))
                .then(() => waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'session simulation unavailable'))
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('.waveform-panel canvas'), 'session waveform unavailable'))
                .then((canvas) => canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: canvas.getBoundingClientRect().left + canvas.clientWidth * 0.6, clientY: canvas.getBoundingClientRect().top + 20 })));
            `);
          } else if (testAction === 'session-check') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 25000) => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => { const value = predicate(); if (value) resolve(value); else if (Date.now() - started > timeout) reject(new Error(label)); else setTimeout(check, 100); };
                check();
              });
              waitFor(() => document.querySelector('.waveform-panel canvas'), 'restored waveform unavailable')
                .then(() => { [...document.querySelectorAll('.view-tabs button')].find((button) => button.textContent.startsWith('Source'))?.click(); })
                .then(() => waitFor(() => document.querySelectorAll('.file-tabs > button').length >= 2, 'restored tabs unavailable'));
            `);
          } else if (testAction === 'crossprobe') {
            await win.webContents.executeJavaScript(`
              const waitFor = (predicate, label, timeout = 20000) => new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => {
                  const value = predicate();
                  if (value) resolve(value);
                  else if (Date.now() - started > timeout) reject(new Error(label));
                  else setTimeout(check, 100);
                };
                check();
              });
              waitFor(() => { const button = document.querySelector('[data-testid="run-simulation"]'); return button && !button.disabled && button; }, 'simulation action unavailable')
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('.waveform-panel canvas'), 'waveform unavailable'))
                .then(() => waitFor(() => { const button = document.querySelector('[data-testid="run-rtl"]'); return button && !button.disabled && button; }, 'RTL action unavailable'))
                .then((button) => button.click())
                .then(() => waitFor(() => document.querySelector('.schematic-panel svg'), 'schematic unavailable'))
                .then(() => { [...document.querySelectorAll('.view-tabs button')].find((button) => button.textContent.startsWith('Waveform'))?.click(); })
                .then(() => waitFor(() => document.querySelector('.signal-name'), 'signal row unavailable'))
                .then((signal) => signal.click())
                .then(() => waitFor(() => document.querySelector('.monaco-editor'), 'Monaco source cross-probe unavailable'));
            `);
          } else {
            const action = ['rtl', 'readme-rtl'].includes(testAction)
              ? 'run-rtl'
              : 'run-simulation';
            const readySelector = ['rtl', 'readme-rtl'].includes(testAction)
              ? '.schematic-panel svg'
              : '.waveform-panel canvas';
            await win.webContents.executeJavaScript(`
            new Promise((resolve, reject) => {
              const started = Date.now();
              const check = () => {
                const button = document.querySelector('[data-testid="${action}"]');
                if (button && !button.disabled) { button.click(); resolve(true); }
                else if (Date.now() - started > 10000) reject(new Error('validation action did not become ready'));
                else setTimeout(check, 100);
              };
              check();
            }).then(() => new Promise((resolve, reject) => {
              const started = Date.now();
              const check = () => {
                if (document.querySelector('${readySelector}')) resolve(true);
                else if (Date.now() - started > 20000) reject(new Error('validation render timeout'));
                else setTimeout(check, 100);
              };
              check();
            })).then(() => { if (${testAction === 'readme-rtl'}) { document.querySelector('.console-panel')?.remove(); document.querySelector('.center-column > .splitter')?.remove(); const center = document.querySelector('.center-column'); if (center) { center.style.gridTemplateRows = 'minmax(0, 1fr)'; center.style.gridTemplateAreas = '"editor"'; } const footer = document.querySelector('footer span:first-child'); if (footer) footer.textContent = 'Example RTL schematic'; } });
            `);
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      } catch (error) {
        console.error('OpenBench validation hook:', error);
      } finally {
        const image = await win.webContents.capturePage();
        await fsp.writeFile(CAPTURE_PATH, image.toPNG());
        app.quit();
      }
    });
  }

  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(entryFile);
}

async function buildTree(directory, root = directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name.startsWith('.openbench-') ||
      entry.name.startsWith('.rtlbench-')
    )
      continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const children = await buildTree(absolutePath, root);
      if (children.length)
        nodes.push({
          kind: 'directory',
          name: entry.name,
          path: path.relative(root, absolutePath),
          children,
        });
    } else if (HDL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      nodes.push({ kind: 'file', name: entry.name, path: path.relative(root, absolutePath) });
    }
  }
  return nodes;
}

function flattenFiles(nodes, output = []) {
  for (const node of nodes) {
    if (node.kind === 'file') output.push(node.path);
    else flattenFiles(node.children, output);
  }
  return output;
}

async function newestGeneratedFile(projectRoot, extension) {
  let newest = null;
  async function walk(directory) {
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (path.extname(entry.name).toLowerCase() === extension) {
        const modified = (await fsp.stat(absolute)).mtimeMs;
        if (!newest || modified > newest.modified) newest = { path: absolute, modified };
      }
    }
  }
  await walk(path.join(projectRoot, '.openbench-runs'));
  await walk(path.join(projectRoot, '.rtlbench-runs'));
  return newest?.path || null;
}

async function recentGeneratedFiles(projectRoot, extension, limit = 6) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (path.extname(entry.name).toLowerCase() === extension)
        files.push({ path: absolute, modified: (await fsp.stat(absolute)).mtimeMs });
    }
  }
  await walk(path.join(projectRoot, '.openbench-runs'));
  await walk(path.join(projectRoot, '.rtlbench-runs'));
  return files.sort((a, b) => b.modified - a.modified).slice(0, limit);
}

function translatedOutput(sender, channel, backend, projectRoot) {
  const translator = createErrorTranslator({ backend, projectRoot });
  const unmatchedLog = path.join(projectRoot, '.openbench-runs', 'unmatched-errors.jsonl');
  const emitProcessed = (processed) => {
    for (const translation of processed.translations)
      sender.send(channel, {
        type: 'output',
        stream: 'translation',
        text: formatTranslation(translation),
      });
    if (processed.unmatched.length) {
      void fsp
        .mkdir(path.dirname(unmatchedLog), { recursive: true })
        .then(() =>
          fsp.appendFile(
            unmatchedLog,
            processed.unmatched
              .map((item) => JSON.stringify({ timestamp: new Date().toISOString(), ...item }))
              .join('\n') + '\n',
          ),
        )
        .catch(() => {});
    }
  };
  return {
    output: (stream, text) => {
      sender.send(channel, { type: 'output', stream, text });
      emitProcessed(translator.push(stream, text));
    },
    flush: () => {
      const pending = translator.flush();
      emitProcessed(pending.stdout);
      emitProcessed(pending.stderr);
    },
  };
}

ipcMain.handle('project:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Add an HDL folder to OpenBench',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fsp.realpath(result.filePaths[0]);
  const candidates = await discoverHdlFiles(root);
  const manifest = await loadManifest(root);
  const modules = [];
  const instantiated = new Set();
  const roles = {};
  for (const relative of candidates) {
    const content = await fsp.readFile(path.join(root, relative), 'utf8');
    const declared = [...content.matchAll(/\bmodule\s+([A-Za-z_$][\w$]*)\b/g)].map(
      (match) => match[1],
    );
    declared.forEach((name) => modules.push({ name, file: relative }));
    for (const match of content.matchAll(
      /(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*(?:#\s*\([^;]*?\)\s*)?[A-Za-z_$][\w$]*\s*\(/g,
    ))
      instantiated.add(match[1]);
    roles[relative] =
      /(?:^|[_.-])(?:tb|testbench)(?:[_.-]|$)/i.test(relative) ||
      declared.some((name) => /(?:^|_)(?:tb|testbench)(?:_|$)/i.test(name))
        ? 'testbench'
        : /\.(?:vh|svh)$/i.test(relative)
          ? 'include'
          : 'design';
  }
  const testbenches = modules.filter((item) => roles[item.file] === 'testbench');
  const suggestedTop =
    modules.find((item) => roles[item.file] === 'design' && !instantiated.has(item.name))?.name ||
    modules.find((item) => roles[item.file] === 'design')?.name ||
    '';
  const suggestedSimulationTop =
    testbenches.find((item) => !instantiated.has(item.name))?.name || testbenches[0]?.name || '';
  return {
    root,
    name: manifest?.name || path.basename(root),
    candidates,
    selected: manifest?.files || candidates,
    roles,
    suggestedTop,
    suggestedSimulationTop,
  };
});

ipcMain.handle('project:activate', async (_event, selection) => {
  const next = await activateProject(selection.root, selection.files || [], selection.name);
  activeProject = next.root;
  const currentSettings = await loadProjectSettings(activeProject);
  if (
    (!currentSettings.topModule && selection.suggestedTop) ||
    (!currentSettings.simulationTop && selection.suggestedSimulationTop)
  )
    await saveProjectSettings(activeProject, {
      ...currentSettings,
      topModule: currentSettings.topModule || selection.suggestedTop || '',
      simulationTop: currentSettings.simulationTop || selection.suggestedSimulationTop || '',
    });
  latestVcdPath = null;
  latestNetlistPath = null;
  return next;
});

ipcMain.handle('project:chooseNewParent', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose where to create the OpenBench project',
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('project:create', async (_event, options) => {
  const next = await createProject(options.parent, options.name, options.withStarter !== false);
  activeProject = next.root;
  latestVcdPath = null;
  latestNetlistPath = null;
  return next;
});

ipcMain.handle('project:getActive', async () => {
  if (!activeProject) return null;
  return projectData(activeProject);
});

ipcMain.handle('project:restore', async (_event, root) => {
  try {
    activeProject = await fsp.realpath(root);
    latestVcdPath = null;
    latestNetlistPath = null;
    return await projectData(activeProject);
  } catch (error) {
    activeProject = null;
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('example:open', async (_event, lessonId = 'getting-started') => {
  const next = await ensureExampleProject(app.getPath('userData'), lessonId);
  activeProject = next.root;
  latestVcdPath = null;
  latestNetlistPath = null;
  return next;
});

ipcMain.handle('session:load', () => sessionStore.loadSession());
ipcMain.handle('session:save', (_event, value) => sessionStore.saveSession(value));
ipcMain.handle('recovery:load', async (_event, relativePath) => {
  if (!activeProject) return null;
  return sessionStore.loadDraft(activeProject, normalizeRelative(relativePath));
});
ipcMain.handle('recovery:save', async (_event, relativePath, content) => {
  if (!activeProject) throw new Error('No project is open.');
  return sessionStore.saveDraft(activeProject, normalizeRelative(relativePath), content);
});
ipcMain.handle('recovery:clear', async (_event, relativePath) => {
  if (!activeProject) return;
  await sessionStore.clearDraft(activeProject, normalizeRelative(relativePath));
});

ipcMain.handle('settings:get', async () => {
  if (!activeProject) throw new Error('No project is open.');
  return await loadProjectSettings(activeProject);
});

ipcMain.handle('settings:save', async (_event, settings) => {
  if (!activeProject) throw new Error('No project is open.');
  return await saveProjectSettings(activeProject, settings);
});

ipcMain.handle('project:refresh', async () => {
  if (!activeProject) throw new Error('No project is open.');
  return projectData(activeProject);
});

ipcMain.handle('project:addFiles', async () => {
  if (!activeProject) throw new Error('No project is open.');
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: 'Add HDL files to this project',
    filters: [{ name: 'Verilog and SystemVerilog', extensions: ['v', 'sv', 'vh', 'svh'] }],
  });
  if (result.canceled) return [];
  return importFiles(activeProject, result.filePaths);
});

ipcMain.handle('file:create', async (_event, relativePath, content = '') => {
  if (!activeProject) throw new Error('No project is open.');
  return createFile(activeProject, relativePath, content);
});

ipcMain.handle('folder:create', async (_event, relativePath) => {
  if (!activeProject) throw new Error('No project is open.');
  return createFolder(activeProject, relativePath);
});

ipcMain.handle('file:rename', async (_event, relativePath, newName) => {
  if (!activeProject) throw new Error('No project is open.');
  return renameEntry(activeProject, relativePath, newName);
});

ipcMain.handle('file:remove', async (event, relativePath) => {
  if (!activeProject) throw new Error('No project is open.');
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(owner, {
    type: 'warning',
    title: 'Remove from project',
    message: `Move “${relativePath}” to the Recycle Bin?`,
    detail:
      'This removes it from the OpenBench project manifest and moves the file or folder to the operating-system trash.',
    buttons: ['Cancel', 'Move to Recycle Bin'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response !== 1) return false;
  await removeEntry(activeProject, relativePath, (target) => shell.trashItem(target));
  return true;
});

ipcMain.handle('file:duplicate', async (_event, relativePath) => {
  if (!activeProject) throw new Error('No project is open.');
  return duplicateFile(activeProject, relativePath);
});

ipcMain.handle('file:reveal', async (_event, relativePath) => {
  if (!activeProject) throw new Error('No project is open.');
  const canonicalRoot = await fsp.realpath(activeProject);
  const target = resolveInside(
    canonicalRoot,
    await fsp.realpath(path.join(canonicalRoot, relativePath)),
  );
  shell.showItemInFolder(target);
});

ipcMain.handle('window:action', async (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

ipcMain.handle('feedback:composeEmail', async (_event, kind, backend) => {
  if (!['feedback', 'bug'].includes(kind)) throw new Error('Unsupported feedback type.');
  if (!['iverilog', 'verilator'].includes(backend))
    throw new Error('Unsupported simulator backend.');
  const isBug = kind === 'bug';
  const subject = isBug ? 'OpenBench Bug Report' : 'OpenBench Feedback';
  const body = isBug
    ? `Hi Jaiden,\n\nI found a problem in OpenBench.\n\nWhat I expected:\n\nWhat happened instead:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nRaw console output (if relevant):\n\n\nOpenBench version: ${app.getVersion()}\nOperating system: ${process.platform} ${process.arch}\nSimulator backend: ${backend}\n\nPlease remember to remove private or course-restricted HDL before attaching files.`
    : `Hi Jaiden,\n\nI have some feedback about OpenBench:\n\n\nWhat would make the app easier to use or learn:\n\n\nOpenBench version: ${app.getVersion()}\nOperating system: ${process.platform} ${process.arch}\nSimulator backend: ${backend}`;
  const query = new URLSearchParams({ subject, body });
  await shell.openExternal(`mailto:jaidenstipp@gmail.com?${query.toString()}`);
});

ipcMain.handle('health:runSelfTest', async () => {
  if (!activeProject) throw new Error('Open a project before running the toolchain self-test.');
  const settings = await loadProjectSettings(activeProject);
  const suiteRoot = resolveToolchainRoot({
    projectRoot: activeProject,
    configuredPath: settings.toolchainPath,
  });
  return runBackendSelfTest(suiteRoot);
});

ipcMain.handle('support:exportBundle', async (event, options = {}) => {
  const project = activeProject ? await projectData(activeProject) : null;
  const settings = activeProject ? await loadProjectSettings(activeProject) : null;
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(owner, {
    title: 'Save OpenBench diagnostic bundle',
    defaultPath: `openbench-support-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'OpenBench support bundle', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const bundle = await createSupportBundle({
    appVersion: app.getVersion(),
    project,
    settings,
    consoleText: options.consoleText,
    includeSource: options.includeSource === true,
  });
  await fsp.writeFile(result.filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return result.filePath;
});

ipcMain.handle('edit:action', async (event, action) => {
  const contents = event.sender;
  if (action === 'undo') contents.undo();
  else if (action === 'redo') contents.redo();
  else if (action === 'cut') contents.cut();
  else if (action === 'copy') contents.copy();
  else if (action === 'paste') contents.paste();
  else if (action === 'selectAll') contents.selectAll();
});

ipcMain.handle('file:read', async (_event, relativePath) => {
  if (!activeProject) throw new Error('No project is open.');
  const canonicalRoot = await fsp.realpath(activeProject);
  const absolutePath = resolveInside(
    canonicalRoot,
    await fsp.realpath(path.join(activeProject, relativePath)),
  );
  return { path: relativePath, content: await fsp.readFile(absolutePath, 'utf8') };
});

ipcMain.handle('file:write', async (_event, relativePath, content) => {
  if (!activeProject) throw new Error('No project is open.');
  const canonicalRoot = await fsp.realpath(activeProject);
  const absolutePath = resolveInside(
    canonicalRoot,
    await fsp.realpath(path.join(activeProject, relativePath)),
  );
  await fsp.writeFile(absolutePath, content, 'utf8');
  return { path: relativePath, saved: true };
});

ipcMain.handle('compile:run', async (event) => {
  if (!activeProject) throw new Error('No project is open.');
  if (compileProcess || simulationRunning || rtlRunning)
    throw new Error('Another backend operation is already running.');
  if (lintProcess) {
    lintProcess.kill();
    lintProcess = null;
  }
  const tree = (await projectData(activeProject)).tree;
  const files = flattenFiles(tree).filter((file) =>
    ['.v', '.sv'].includes(path.extname(file).toLowerCase()),
  );
  if (!files.length)
    throw new Error('The project contains no Verilog or SystemVerilog source files.');

  const settings = await loadProjectSettings(activeProject);
  const suiteRoot = resolveToolchainRoot({
    projectRoot: activeProject,
    configuredPath: settings.toolchainPath,
    appDirectory: __dirname,
  });
  const translated = translatedOutput(
    event.sender,
    'compile:event',
    settings.simulator,
    activeProject,
  );
  const compileOptions = {
    projectRoot: activeProject,
    files,
    suiteRoot,
    includePaths: settings.includePaths,
    topModule: settings.simulationTop || settings.topModule,
    onOutput: translated.output,
  };
  const run =
    settings.simulator === 'verilator'
      ? startVerilatorLint(compileOptions)
      : startIcarusCompile({ ...compileOptions, executableOverride: IVERILOG_OVERRIDE });
  compileProcess = run.child;
  event.sender.send('compile:event', { type: 'start', command: run.command });
  try {
    const result = await run.completion;
    event.sender.send('compile:event', { type: 'finish', code: result.code });
    return result;
  } catch (error) {
    event.sender.send('compile:event', { type: 'finish', code: -1 });
    throw error;
  } finally {
    translated.flush();
    compileProcess = null;
  }
});

ipcMain.handle('lint:run', async () => {
  if (!activeProject || compileProcess || simulationRunning || rtlRunning)
    return { code: 0, output: '', skipped: true };
  if (lintProcess) lintProcess.kill();
  const tree = (await projectData(activeProject)).tree;
  const files = flattenFiles(tree).filter((file) =>
    ['.v', '.sv'].includes(path.extname(file).toLowerCase()),
  );
  if (!files.length) return { code: 0, output: '', skipped: false };
  const settings = await loadProjectSettings(activeProject);
  const suiteRoot = resolveToolchainRoot({
    projectRoot: activeProject,
    configuredPath: settings.toolchainPath,
    appDirectory: __dirname,
  });
  let output = '';
  const options = {
    projectRoot: activeProject,
    files,
    suiteRoot,
    includePaths: settings.includePaths,
    topModule: '',
    onOutput: (_stream, text) => {
      output += text;
    },
  };
  const run =
    settings.simulator === 'verilator'
      ? startVerilatorLint(options)
      : startIcarusCompile({ ...options, executableOverride: IVERILOG_OVERRIDE });
  lintProcess = run.child;
  try {
    const result = await run.completion;
    return { code: result.code, output, skipped: false };
  } catch (error) {
    return { code: -1, output: `${output}${error.message}\n`, skipped: false };
  } finally {
    if (lintProcess === run.child) lintProcess = null;
  }
});

ipcMain.handle('simulation:run', async (event, breakpoints = []) => {
  if (!activeProject) throw new Error('No project is open.');
  if (compileProcess || simulationRunning || rtlRunning)
    throw new Error('Another backend operation is already running.');
  if (lintProcess) {
    lintProcess.kill();
    lintProcess = null;
  }
  const tree = (await projectData(activeProject)).tree;
  const files = flattenFiles(tree).filter((file) =>
    ['.v', '.sv'].includes(path.extname(file).toLowerCase()),
  );
  if (!files.length)
    throw new Error('The project contains no Verilog or SystemVerilog source files.');
  const settings = await loadProjectSettings(activeProject);
  const suiteRoot = resolveToolchainRoot({
    projectRoot: activeProject,
    configuredPath: settings.toolchainPath,
    appDirectory: __dirname,
  });
  simulationRunning = true;
  latestVcdPath = null;
  event.sender.send('simulation:event', { type: 'start', backend: settings.simulator });
  const translated = translatedOutput(
    event.sender,
    'simulation:event',
    settings.simulator,
    activeProject,
  );
  try {
    const simulation =
      settings.simulator === 'verilator' ? runVerilatorSimulation : runIcarusSimulation;
    const result = await simulation({
      projectRoot: activeProject,
      files,
      suiteRoot,
      includePaths: settings.includePaths,
      topModule: settings.simulationTop,
      breakpoints: settings.simulator === 'iverilog' ? breakpoints : [],
      onOutput: translated.output,
    });
    latestVcdPath = result.vcdPath;
    event.sender.send('simulation:event', {
      type: 'finish',
      code: 0,
      vcdPath: path.basename(result.vcdPath),
      breakpointHit: result.breakpointHit || null,
    });
    return {
      code: 0,
      vcdPath: path.basename(result.vcdPath),
      breakpointHit: result.breakpointHit || null,
    };
  } catch (error) {
    event.sender.send('simulation:event', { type: 'finish', code: -1 });
    throw error;
  } finally {
    translated.flush();
    simulationRunning = false;
  }
});

ipcMain.handle('waveform:readLatest', async () => {
  if (!activeProject) throw new Error('No simulation waveform is available.');
  if (!latestVcdPath) latestVcdPath = await newestGeneratedFile(activeProject, '.vcd');
  if (!latestVcdPath) throw new Error('No simulation waveform is available.');
  const canonicalRoot = await fsp.realpath(activeProject);
  const canonicalVcd = resolveInside(canonicalRoot, await fsp.realpath(latestVcdPath));
  return { name: path.basename(canonicalVcd), content: await fsp.readFile(canonicalVcd, 'utf8') };
});

ipcMain.handle('waveform:listRuns', async () => {
  if (!activeProject) return [];
  const canonicalRoot = await fsp.realpath(activeProject);
  const files = await recentGeneratedFiles(canonicalRoot, '.vcd');
  return Promise.all(
    files.map(async (file, index) => {
      const canonical = resolveInside(canonicalRoot, await fsp.realpath(file.path));
      return {
        id: `saved-${file.modified}-${index}`,
        name: path.basename(path.dirname(canonical)),
        createdAt: file.modified,
        fileName: path.basename(canonical),
        content: await fsp.readFile(canonical, 'utf8'),
      };
    }),
  );
});

ipcMain.handle('rtl:run', async (event) => {
  if (!activeProject) throw new Error('No project is open.');
  if (compileProcess || simulationRunning || rtlRunning)
    throw new Error('Another backend operation is already running.');
  if (lintProcess) {
    lintProcess.kill();
    lintProcess = null;
  }
  const tree = (await projectData(activeProject)).tree;
  const allFiles = flattenFiles(tree).filter((file) =>
    ['.v', '.sv'].includes(path.extname(file).toLowerCase()),
  );
  const designFiles = allFiles.filter(
    (file) => !/(^|[_.-])(tb|testbench)([_.-]|$)/i.test(path.basename(file)),
  );
  const files = designFiles.length ? designFiles : allFiles;
  if (!files.length)
    throw new Error('The project contains no Verilog or SystemVerilog design sources.');
  const settings = await loadProjectSettings(activeProject);
  const suiteRoot = resolveToolchainRoot({
    projectRoot: activeProject,
    configuredPath: settings.toolchainPath,
    appDirectory: __dirname,
  });
  rtlRunning = true;
  latestNetlistPath = null;
  event.sender.send('rtl:event', { type: 'start' });
  const translated = translatedOutput(event.sender, 'rtl:event', 'yosys', activeProject);
  try {
    const result = await runYosysElaboration({
      projectRoot: activeProject,
      files,
      suiteRoot,
      topModule: settings.topModule,
      includePaths: settings.includePaths,
      onOutput: translated.output,
    });
    latestNetlistPath = result.jsonPath;
    event.sender.send('rtl:event', {
      type: 'finish',
      code: 0,
      top: result.top,
      moduleCount: result.moduleCount,
    });
    return { code: 0, top: result.top, moduleCount: result.moduleCount };
  } catch (error) {
    event.sender.send('rtl:event', { type: 'finish', code: -1 });
    throw error;
  } finally {
    translated.flush();
    rtlRunning = false;
  }
});

ipcMain.handle('rtl:readLatest', async () => {
  if (!activeProject) throw new Error('No elaborated RTL netlist is available.');
  if (!latestNetlistPath) latestNetlistPath = await newestGeneratedFile(activeProject, '.json');
  if (!latestNetlistPath) throw new Error('No elaborated RTL netlist is available.');
  const canonicalRoot = await fsp.realpath(activeProject);
  const canonicalJson = resolveInside(canonicalRoot, await fsp.realpath(latestNetlistPath));
  const netlist = JSON.parse(await fsp.readFile(canonicalJson, 'utf8'));
  const modules = Object.entries(netlist.modules || {});
  const top =
    modules.find(
      ([, module]) => module.attributes?.top === '00000000000000000000000000000001',
    )?.[0] ||
    modules[0]?.[0] ||
    null;
  return { name: path.basename(canonicalJson), top, netlist };
});

ipcMain.handle('testbench:generate', async (_event, moduleName, options = {}) => {
  if (!activeProject || !latestNetlistPath)
    throw new Error(
      'Run RTL Analysis before generating a testbench. OpenBench uses the real Yosys port metadata.',
    );
  const netlist = JSON.parse(await fsp.readFile(latestNetlistPath, 'utf8'));
  const generated = generateStarterTestbench(netlist, moduleName, options);
  const destination = resolveInside(
    await fsp.realpath(activeProject),
    path.join(activeProject, generated.fileName),
  );
  try {
    await fsp.writeFile(destination, generated.content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `${generated.fileName} already exists. OpenBench will not overwrite an editable testbench.`,
      );
    throw error;
  }
  const manifest = await loadManifest(activeProject);
  if (manifest)
    await saveManifest(activeProject, {
      ...manifest,
      files: [...manifest.files, generated.fileName],
    });
  return { path: generated.fileName, detected: generated.detected };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
