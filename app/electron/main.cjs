const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isAllowedNavigation, resolveInside } = require('./security.cjs');
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
const { createWorkspaceRegistry } = require('./workspaceController.cjs');
const { registerWaveformIpc } = require('./ipc/waveform.cjs');
const { orderSourceFiles } = require('./sourceOrder.cjs');
const hdlStructure = import('../shared/hdlStructure.js');

const HDL_EXTENSIONS = new Set(['.v', '.sv', '.vh', '.svh']);
const TEST_PROJECT =
  process.env.RTLDECK_TEST_PROJECT ||
  process.env.OPENBENCH_TEST_PROJECT ||
  process.env.RTLBENCH_TEST_PROJECT;
const TEST_ACTION =
  process.env.RTLDECK_TEST_ACTION ||
  process.env.OPENBENCH_TEST_ACTION ||
  process.env.RTLBENCH_TEST_ACTION ||
  'simulation';
const CAPTURE_PATH =
  process.env.RTLDECK_CAPTURE_PATH ||
  process.env.OPENBENCH_CAPTURE_PATH ||
  process.env.RTLBENCH_CAPTURE_PATH;
const DEV_URL =
  process.env.RTLDECK_DEV_URL || process.env.OPENBENCH_DEV_URL || process.env.RTLBENCH_DEV_URL;
const IVERILOG_OVERRIDE =
  process.env.RTLDECK_IVERILOG || process.env.OPENBENCH_IVERILOG || process.env.RTLBENCH_IVERILOG;
const initialProjectRoot = TEST_PROJECT ? path.resolve(TEST_PROJECT) : null;
const workspaceRegistry = createWorkspaceRegistry(initialProjectRoot);
const getWorkspace = (sender) => workspaceRegistry.forSender(sender);

if (CAPTURE_PATH)
  app.setPath('userData', path.join(path.dirname(CAPTURE_PATH), '.electron-validation'));
const sessionStore = createSessionStore(path.join(app.getPath('userData'), 'rtldeck-state'), {
  legacyDirectories: [
    path.join(app.getPath('userData'), 'openbench-state'),
    path.join(app.getPath('appData'), 'OpenBench', 'openbench-state'),
    path.join(app.getPath('appData'), 'openbench', 'openbench-state'),
  ],
});

function createWindow() {
  const win = new BrowserWindow({
    title: 'RTLDeck',
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
  const packagedEntryUrl = pathToFileURL(entryFile).href;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devUrl, packagedEntryUrl)) event.preventDefault();
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
              window.dispatchEvent(new CustomEvent('rtldeck:show-new-project', { detail: 'C:\\\\Users\\\\Student\\\\Documents' }));
              new Promise((resolve, reject) => { const started = Date.now(); const check = () => { if (document.querySelector('.project-dialog')) resolve(true); else if (Date.now() - started > 5000) reject(new Error('new project dialog unavailable')); else setTimeout(check, 100); }; check(); });
            `);
          } else if (testAction === 'import') {
            await win.webContents.executeJavaScript(`
              window.dispatchEvent(new CustomEvent('rtldeck:show-import', { detail: { root: 'C:\\\\Users\\\\Student\\\\Documents\\\\traffic-light', name: 'traffic-light', candidates: ['rtl/traffic_light.sv', 'rtl/timer.sv', 'sim/traffic_light_tb.sv', 'notes/experimental.sv'], selected: ['rtl/traffic_light.sv', 'sim/traffic_light_tb.sv'] } }));
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
              waitFor(() => [...document.querySelectorAll('.tree-file')].find((button) => button.textContent.includes('traffic_light.sv') && !button.textContent.includes('_tb')), 'source file unavailable').then((button) => button.click()).then(() => waitFor(() => document.querySelector('.monaco-editor'), 'source editor unavailable')).then(() => new Promise((resolve) => setTimeout(resolve, 500))).then(() => { window.dispatchEvent(new CustomEvent('rtldeck:show-concept', { detail: { line: 15, column: 8 } })); }).then(() => waitFor(() => document.querySelector('.source-concept-card'), 'concept card unavailable'));
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
                .then((textarea) => { window.__rtldeckBeforeWatch = document.querySelector('.console')?.textContent || ''; textarea.focus(); window.dispatchEvent(new CustomEvent('rtldeck:insert-editor-text', { detail: String.fromCharCode(10) + '// Saved by the RTLDeck watch-mode validation.' })); })
                .then(() => waitFor(() => { const button = document.querySelector('[data-testid="save-file"]'); return button && !button.disabled && button; }, 'save did not become available'))
                .then((button) => button.click())
                .then(() => waitFor(() => { const text = document.querySelector('.console')?.textContent || ''; return text !== window.__rtldeckBeforeWatch && text.includes('Simulation finished with exit code 0'); }, 'watch rerun did not finish'))
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
                .then((textarea) => { textarea.focus(); window.dispatchEvent(new CustomEvent('rtldeck:insert-editor-text', { detail: String.fromCharCode(10) + 'this is not valid verilog' })); })
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
        console.error('RTLDeck validation hook:', error);
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
      entry.name.startsWith('.rtldeck-') ||
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
  await walk(path.join(projectRoot, '.rtldeck-runs'));
  await walk(path.join(projectRoot, '.openbench-runs'));
  await walk(path.join(projectRoot, '.rtlbench-runs'));
  return newest?.path || null;
}

function translatedOutput(sender, channel, backend, projectRoot) {
  const translator = createErrorTranslator({ backend, projectRoot });
  const unmatchedLog = path.join(projectRoot, '.rtldeck-runs', 'unmatched-errors.jsonl');
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
        .catch((error) =>
          console.warn('RTLDeck could not append unmatched backend diagnostics', {
            projectRoot,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
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

async function prepareBackendRun(
  event,
  { designOnly = false, allowEmpty = false, operation } = {},
) {
  const workspace = getWorkspace(event.sender);
  const projectRoot = workspace.captureProject();
  if (workspace.isBackendBusy()) throw new Error('Another backend operation is already running.');
  workspace.stopLint();
  if (operation) workspace.startOperation(operation);
  try {
    const allFiles = flattenFiles((await projectData(projectRoot)).tree).filter((file) =>
      ['.v', '.sv'].includes(path.extname(file).toLowerCase()),
    );
    const designFiles = designOnly
      ? allFiles.filter((file) => !/(^|[_.-])(tb|testbench)([_.-]|$)/i.test(path.basename(file)))
      : allFiles;
    const selectedFiles = designOnly && designFiles.length ? designFiles : allFiles;
    const files = await orderSourceFiles(projectRoot, selectedFiles);
    if (!allowEmpty && !files.length)
      throw new Error(
        designOnly
          ? 'The project contains no Verilog or SystemVerilog design sources.'
          : 'The project contains no Verilog or SystemVerilog source files.',
      );
    const settings = await loadProjectSettings(projectRoot);
    const suiteRoot = resolveToolchainRoot({
      projectRoot,
      configuredPath: settings.toolchainPath,
      appDirectory: __dirname,
    });
    return { workspace, projectRoot, files, settings, suiteRoot };
  } catch (error) {
    if (operation) workspace.finishOperation(operation);
    throw error;
  }
}

function launchPreparedProcess(workspace, operation, launch) {
  try {
    const run = launch();
    workspace.startOperation(operation, run.child);
    return run;
  } catch (error) {
    workspace.finishOperation(operation);
    throw error;
  }
}

ipcMain.handle('project:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Add an HDL folder to RTLDeck',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fsp.realpath(result.filePaths[0]);
  const candidates = await discoverHdlFiles(root);
  const manifest = await loadManifest(root);
  const files = await Promise.all(
    candidates.map(async (relative) => ({
      path: relative,
      content: await fsp.readFile(path.join(root, relative), 'utf8'),
    })),
  );
  const { analyzeHdlFiles } = await hdlStructure;
  const analysis = analyzeHdlFiles(files);
  const savedSettings = manifest ? await loadProjectSettings(root) : null;
  return {
    root,
    name: manifest?.name || path.basename(root),
    candidates,
    selected: manifest?.files || candidates,
    roles: analysis.roles,
    modules: analysis.modules,
    suggestedTop: savedSettings?.topModule || analysis.suggestedTop,
    suggestedSimulationTop: savedSettings?.simulationTop || analysis.suggestedSimulationTop,
    existingProject: Boolean(manifest),
  };
});

ipcMain.handle('project:activate', async (event, selection) => {
  const next = selection.existingProject
    ? await projectData(selection.root)
    : await activateProject(selection.root, selection.files || [], selection.name);
  getWorkspace(event.sender).setProject(next.root);
  const currentSettings = await loadProjectSettings(next.root);
  if (selection.topModule !== undefined || selection.simulationTop !== undefined)
    await saveProjectSettings(next.root, {
      ...currentSettings,
      topModule: selection.topModule || '',
      simulationTop: selection.simulationTop || '',
    });
  return next;
});

ipcMain.handle('project:chooseNewParent', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose where to create the RTLDeck project',
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('project:create', async (event, options) => {
  const next = await createProject(
    options.parent,
    options.name,
    options.withStarter !== false,
    options.topModule || '',
  );
  getWorkspace(event.sender).setProject(next.root);
  return next;
});

ipcMain.handle('project:getActive', async (event) => {
  const projectRoot = getWorkspace(event.sender).projectRoot;
  if (!projectRoot) return null;
  return projectData(projectRoot);
});

ipcMain.handle('project:restore', async (event, root) => {
  try {
    const projectRoot = await fsp.realpath(root);
    getWorkspace(event.sender).setProject(projectRoot);
    return await projectData(projectRoot);
  } catch (error) {
    getWorkspace(event.sender).setProject(null);
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('example:open', async (event, lessonId = 'getting-started') => {
  const next = await ensureExampleProject(app.getPath('userData'), lessonId);
  getWorkspace(event.sender).setProject(next.root);
  return next;
});

ipcMain.handle('session:load', () => sessionStore.loadSession());
ipcMain.handle('session:save', (_event, value) => sessionStore.saveSession(value));
ipcMain.handle('recovery:load', async (event, relativePath) => {
  const projectRoot = getWorkspace(event.sender).projectRoot;
  if (!projectRoot) return null;
  return sessionStore.loadDraft(projectRoot, normalizeRelative(relativePath));
});
ipcMain.handle('recovery:save', async (event, relativePath, content) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  return sessionStore.saveDraft(projectRoot, normalizeRelative(relativePath), content);
});
ipcMain.handle('recovery:clear', async (event, relativePath) => {
  const projectRoot = getWorkspace(event.sender).projectRoot;
  if (!projectRoot) return;
  await sessionStore.clearDraft(projectRoot, normalizeRelative(relativePath));
});

ipcMain.handle('settings:get', async (event) => {
  return await loadProjectSettings(getWorkspace(event.sender).captureProject());
});

ipcMain.handle('settings:save', async (event, settings) => {
  return await saveProjectSettings(getWorkspace(event.sender).captureProject(), settings);
});

ipcMain.handle('project:refresh', async (event) => {
  return projectData(getWorkspace(event.sender).captureProject());
});

ipcMain.handle('project:readSources', async (event) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const canonicalRoot = await fsp.realpath(projectRoot);
  const files = flattenFiles((await projectData(projectRoot)).tree).filter((file) =>
    ['.v', '.sv'].includes(path.extname(file).toLowerCase()),
  );
  return Promise.all(
    files.map(async (relativePath) => ({
      path: relativePath,
      content: await fsp.readFile(
        resolveInside(canonicalRoot, await fsp.realpath(path.join(canonicalRoot, relativePath))),
        'utf8',
      ),
    })),
  );
});

ipcMain.handle('project:addFiles', async (event) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: 'Add HDL files to this project',
    filters: [{ name: 'Verilog and SystemVerilog', extensions: ['v', 'sv', 'vh', 'svh'] }],
  });
  if (result.canceled) return [];
  return importFiles(projectRoot, result.filePaths);
});

ipcMain.handle('file:create', async (event, relativePath, content = '') => {
  return createFile(getWorkspace(event.sender).captureProject(), relativePath, content);
});

ipcMain.handle('folder:create', async (event, relativePath) => {
  return createFolder(getWorkspace(event.sender).captureProject(), relativePath);
});

ipcMain.handle('file:rename', async (event, relativePath, newName) => {
  return renameEntry(getWorkspace(event.sender).captureProject(), relativePath, newName);
});

ipcMain.handle('file:remove', async (event, relativePath) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(owner, {
    type: 'warning',
    title: 'Remove from project',
    message: `Move “${relativePath}” to the Recycle Bin?`,
    detail:
      'This removes it from the RTLDeck project manifest and moves the file or folder to the operating-system trash.',
    buttons: ['Cancel', 'Move to Recycle Bin'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response !== 1) return false;
  await removeEntry(projectRoot, relativePath, (target) => shell.trashItem(target));
  return true;
});

ipcMain.handle('file:duplicate', async (event, relativePath) => {
  return duplicateFile(getWorkspace(event.sender).captureProject(), relativePath);
});

ipcMain.handle('file:reveal', async (event, relativePath) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const canonicalRoot = await fsp.realpath(projectRoot);
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
  const subject = isBug ? 'RTLDeck Bug Report' : 'RTLDeck Feedback';
  const body = isBug
    ? `Hi Jaiden,\n\nI found a problem in RTLDeck.\n\nWhat I expected:\n\nWhat happened instead:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nRaw console output (if relevant):\n\n\nRTLDeck version: ${app.getVersion()}\nOperating system: ${process.platform} ${process.arch}\nSimulator backend: ${backend}\n\nPlease remember to remove private or course-restricted HDL before attaching files.`
    : `Hi Jaiden,\n\nI have some feedback about RTLDeck:\n\n\nWhat would make the app easier to use or learn:\n\n\nRTLDeck version: ${app.getVersion()}\nOperating system: ${process.platform} ${process.arch}\nSimulator backend: ${backend}`;
  const query = new URLSearchParams({ subject, body });
  await shell.openExternal(`mailto:jaidenstipp@gmail.com?${query.toString()}`);
});

ipcMain.handle('health:runSelfTest', async (event) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const settings = await loadProjectSettings(projectRoot);
  const suiteRoot = resolveToolchainRoot({
    projectRoot,
    configuredPath: settings.toolchainPath,
  });
  return runBackendSelfTest(suiteRoot);
});

ipcMain.handle('support:exportBundle', async (event, options = {}) => {
  const projectRoot = getWorkspace(event.sender).projectRoot;
  const project = projectRoot ? await projectData(projectRoot) : null;
  const settings = projectRoot ? await loadProjectSettings(projectRoot) : null;
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(owner, {
    title: 'Save RTLDeck diagnostic bundle',
    defaultPath: `rtldeck-support-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'RTLDeck support bundle', extensions: ['json'] }],
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

ipcMain.handle('file:read', async (event, relativePath) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const canonicalRoot = await fsp.realpath(projectRoot);
  const absolutePath = resolveInside(
    canonicalRoot,
    await fsp.realpath(path.join(projectRoot, relativePath)),
  );
  return { path: relativePath, content: await fsp.readFile(absolutePath, 'utf8') };
});

ipcMain.handle('file:write', async (event, relativePath, content) => {
  const projectRoot = getWorkspace(event.sender).captureProject();
  const canonicalRoot = await fsp.realpath(projectRoot);
  const absolutePath = resolveInside(
    canonicalRoot,
    await fsp.realpath(path.join(projectRoot, relativePath)),
  );
  await fsp.writeFile(absolutePath, content, 'utf8');
  return { path: relativePath, saved: true };
});

ipcMain.handle('compile:run', async (event) => {
  const { workspace, projectRoot, files, settings, suiteRoot } = await prepareBackendRun(event, {
    operation: 'compile',
  });
  const translated = translatedOutput(
    event.sender,
    'compile:event',
    settings.simulator,
    projectRoot,
  );
  const compileOptions = {
    projectRoot,
    files,
    suiteRoot,
    includePaths: settings.includePaths,
    topModule: settings.simulationTop || settings.topModule,
    onOutput: translated.output,
  };
  const run = launchPreparedProcess(workspace, 'compile', () =>
    settings.simulator === 'verilator'
      ? startVerilatorLint(compileOptions)
      : startIcarusCompile({ ...compileOptions, executableOverride: IVERILOG_OVERRIDE }),
  );
  event.sender.send('compile:event', {
    type: 'start',
    command: run.command,
    fileCount: files.length,
    backend: settings.simulator,
  });
  try {
    const result = await run.completion;
    event.sender.send('compile:event', { type: 'finish', code: result.code });
    return result;
  } catch (error) {
    event.sender.send('compile:event', { type: 'finish', code: -1 });
    throw error;
  } finally {
    translated.flush();
    workspace.finishOperation('compile', run.child);
  }
});

ipcMain.handle('lint:run', async (event) => {
  const workspace = getWorkspace(event.sender);
  if (!workspace.projectRoot || workspace.isBackendBusy())
    return { code: 0, output: '', skipped: true };
  const prepared = await prepareBackendRun(event, { allowEmpty: true, operation: 'lint' });
  const { projectRoot, files, settings, suiteRoot } = prepared;
  if (!files.length) {
    workspace.finishOperation('lint');
    return { code: 0, output: '', skipped: false };
  }
  let output = '';
  const options = {
    projectRoot,
    files,
    suiteRoot,
    includePaths: settings.includePaths,
    topModule: '',
    onOutput: (_stream, text) => {
      output += text;
    },
  };
  const run = launchPreparedProcess(workspace, 'lint', () =>
    settings.simulator === 'verilator'
      ? startVerilatorLint(options)
      : startIcarusCompile({ ...options, executableOverride: IVERILOG_OVERRIDE }),
  );
  try {
    const result = await run.completion;
    return { code: result.code, output, skipped: false };
  } catch (error) {
    return { code: -1, output: `${output}${error.message}\n`, skipped: false };
  } finally {
    workspace.finishOperation('lint', run.child);
  }
});

ipcMain.handle('simulation:run', async (event, breakpoints = []) => {
  const { workspace, projectRoot, files, settings, suiteRoot } = await prepareBackendRun(event, {
    operation: 'simulation',
  });
  workspace.latestVcdPath = null;
  event.sender.send('simulation:event', { type: 'start', backend: settings.simulator });
  const translated = translatedOutput(
    event.sender,
    'simulation:event',
    settings.simulator,
    projectRoot,
  );
  try {
    const simulation =
      settings.simulator === 'verilator' ? runVerilatorSimulation : runIcarusSimulation;
    const result = await simulation({
      projectRoot,
      files,
      suiteRoot,
      includePaths: settings.includePaths,
      topModule: settings.simulationTop,
      breakpoints: settings.simulator === 'iverilog' ? breakpoints : [],
      onOutput: translated.output,
    });
    if (workspace.projectRoot === projectRoot) workspace.latestVcdPath = result.vcdPath;
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
    workspace.finishOperation('simulation');
  }
});

registerWaveformIpc({ ipcMain, getWorkspace });

ipcMain.handle('rtl:run', async (event) => {
  const { workspace, projectRoot, files, settings, suiteRoot } = await prepareBackendRun(event, {
    designOnly: true,
    operation: 'rtl',
  });
  workspace.latestNetlistPath = null;
  event.sender.send('rtl:event', { type: 'start' });
  const translated = translatedOutput(event.sender, 'rtl:event', 'yosys', projectRoot);
  try {
    const result = await runYosysElaboration({
      projectRoot,
      files,
      suiteRoot,
      topModule: settings.topModule,
      includePaths: settings.includePaths,
      onOutput: translated.output,
    });
    if (workspace.projectRoot === projectRoot) workspace.latestNetlistPath = result.jsonPath;
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
    workspace.finishOperation('rtl');
  }
});

ipcMain.handle('rtl:readLatest', async (event) => {
  const workspace = getWorkspace(event.sender);
  const projectRoot = workspace.captureProject();
  if (!workspace.latestNetlistPath)
    workspace.latestNetlistPath = await newestGeneratedFile(projectRoot, '.json');
  if (!workspace.latestNetlistPath) throw new Error('No elaborated RTL netlist is available.');
  const canonicalRoot = await fsp.realpath(projectRoot);
  const canonicalJson = resolveInside(
    canonicalRoot,
    await fsp.realpath(workspace.latestNetlistPath),
  );
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

ipcMain.handle('testbench:generate', async (event, moduleName, options = {}) => {
  const workspace = getWorkspace(event.sender);
  const projectRoot = workspace.captureProject();
  if (!workspace.latestNetlistPath)
    throw new Error(
      'Run RTL Analysis before generating a testbench. RTLDeck uses the real Yosys port metadata.',
    );
  const netlist = JSON.parse(await fsp.readFile(workspace.latestNetlistPath, 'utf8'));
  const generated = generateStarterTestbench(netlist, moduleName, options);
  const destination = resolveInside(
    await fsp.realpath(projectRoot),
    path.join(projectRoot, generated.fileName),
  );
  try {
    await fsp.writeFile(destination, generated.content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `${generated.fileName} already exists. RTLDeck will not overwrite an editable testbench.`,
      );
    throw error;
  }
  const manifest = await loadManifest(projectRoot);
  if (manifest)
    await saveManifest(projectRoot, {
      ...manifest,
      files: [...manifest.files, generated.fileName],
    });
  return { path: generated.fileName, detected: generated.detected };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
