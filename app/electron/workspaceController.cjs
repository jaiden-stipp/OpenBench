function createWorkspaceController(initialProjectRoot = null) {
  return {
    projectRoot: initialProjectRoot,
    compileProcess: null,
    lintProcess: null,
    simulationRunning: false,
    rtlRunning: false,
    latestVcdPath: null,
    latestNetlistPath: null,
    setProject(projectRoot) {
      this.projectRoot = projectRoot;
      this.latestVcdPath = null;
      this.latestNetlistPath = null;
    },
    captureProject() {
      if (!this.projectRoot) throw new Error('No project is open.');
      return this.projectRoot;
    },
    isBackendBusy() {
      return Boolean(this.compileProcess || this.simulationRunning || this.rtlRunning);
    },
    stopLint() {
      this.lintProcess?.kill();
      this.lintProcess = null;
    },
    startOperation(kind, handle = true) {
      const operation = operationState(kind);
      this[operation.field] = handle;
      return handle;
    },
    finishOperation(kind, handle = true) {
      const operation = operationState(kind);
      if (this[operation.field] === handle || handle === true)
        this[operation.field] = operation.inactive;
    },
  };
}

function operationState(kind) {
  const operations = {
    compile: { field: 'compileProcess', inactive: null },
    lint: { field: 'lintProcess', inactive: null },
    simulation: { field: 'simulationRunning', inactive: false },
    rtl: { field: 'rtlRunning', inactive: false },
  };
  if (!operations[kind]) throw new Error(`Unknown backend operation: ${kind}`);
  return operations[kind];
}

function createWorkspaceRegistry(initialProjectRoot = null) {
  const workspaces = new Map();
  return {
    forSender(sender) {
      const id = sender.id;
      if (!workspaces.has(id)) {
        const workspace = createWorkspaceController(initialProjectRoot);
        workspaces.set(id, workspace);
        sender.once('destroyed', () => workspaces.delete(id));
      }
      return workspaces.get(id);
    },
    size() {
      return workspaces.size;
    },
  };
}

module.exports = { createWorkspaceController, createWorkspaceRegistry };
