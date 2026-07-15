const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rtlbench', {
  selectProjectFolder: () => ipcRenderer.invoke('project:selectFolder'),
  activateProject: (selection) => ipcRenderer.invoke('project:activate', selection),
  chooseNewProjectParent: () => ipcRenderer.invoke('project:chooseNewParent'),
  createProject: (options) => ipcRenderer.invoke('project:create', options),
  getActiveProject: () => ipcRenderer.invoke('project:getActive'),
  restoreProject: (root) => ipcRenderer.invoke('project:restore', root),
  openExampleProject: () => ipcRenderer.invoke('example:open'),
  refreshProject: () => ipcRenderer.invoke('project:refresh'),
  addProjectFiles: () => ipcRenderer.invoke('project:addFiles'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('file:write', path, content),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (value) => ipcRenderer.invoke('session:save', value),
  loadRecoveryDraft: (path) => ipcRenderer.invoke('recovery:load', path),
  saveRecoveryDraft: (path, content) => ipcRenderer.invoke('recovery:save', path, content),
  clearRecoveryDraft: (path) => ipcRenderer.invoke('recovery:clear', path),
  createFile: (path, content) => ipcRenderer.invoke('file:create', path, content),
  createFolder: (path) => ipcRenderer.invoke('folder:create', path),
  renameEntry: (path, name) => ipcRenderer.invoke('file:rename', path, name),
  removeEntry: (path) => ipcRenderer.invoke('file:remove', path),
  duplicateFile: (path) => ipcRenderer.invoke('file:duplicate', path),
  revealFile: (path) => ipcRenderer.invoke('file:reveal', path),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  composeFeedbackEmail: (kind, backend) => ipcRenderer.invoke('feedback:composeEmail', kind, backend),
  editAction: (action) => ipcRenderer.invoke('edit:action', action),
  runCompile: () => ipcRenderer.invoke('compile:run'),
  runInlineLint: () => ipcRenderer.invoke('lint:run'),
  runSimulation: (breakpoints) => ipcRenderer.invoke('simulation:run', breakpoints),
  readLatestVcd: () => ipcRenderer.invoke('waveform:readLatest'),
  runRtl: () => ipcRenderer.invoke('rtl:run'),
  readLatestNetlist: () => ipcRenderer.invoke('rtl:readLatest'),
  generateTestbench: (moduleName) => ipcRenderer.invoke('testbench:generate', moduleName),
  onCompileEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('compile:event', handler);
    return () => ipcRenderer.removeListener('compile:event', handler);
  },
  onSimulationEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('simulation:event', handler);
    return () => ipcRenderer.removeListener('simulation:event', handler);
  },
  onRtlEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('rtl:event', handler);
    return () => ipcRenderer.removeListener('rtl:event', handler);
  },
});
