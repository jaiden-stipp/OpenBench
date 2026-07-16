type ProjectNode = {
  kind: 'file' | 'directory';
  name: string;
  path: string;
  children?: ProjectNode[];
};

type ProjectData = {
  root: string;
  name: string;
  files: string[];
  folders: string[];
  tree: ProjectNode[];
};
type ProjectSelection = {
  root: string;
  name: string;
  candidates: string[];
  selected: string[];
  roles?: Record<string, 'design' | 'testbench' | 'include'>;
  suggestedTop?: string;
  suggestedSimulationTop?: string;
};
type ProjectSettings = {
  topModule: string;
  simulationTop: string;
  includePaths: string[];
  simulator: 'iverilog' | 'verilator';
  toolchainPath: string;
};
type WaveBreakpoint = { signalPath: string; width: number; value: string };
type WaveformSession = {
  views: Array<{ key: string; radix: 'bin' | 'hex' | 'dec'; group: string; selected: boolean }>;
  search: string;
  groupFilter: string;
  viewStart: number;
  viewEnd: number;
  cursor: number;
  cursorB?: number | null;
  bookmarks?: Array<{ time: number; label: string }>;
};
type OpenBenchSession = {
  version: number;
  projectRoot: string;
  openFiles: string[];
  activeFile: string;
  activeView: 'source' | 'waveform' | 'schematic';
  editorCursor: { path: string; line: number; column: number } | null;
  waveform: WaveformSession | null;
};
type CompileEvent =
  | { type: 'start'; command: string }
  | { type: 'output'; stream: 'stdout' | 'stderr' | 'translation'; text: string }
  | { type: 'finish'; code: number };
type SimulationEvent =
  | { type: 'start'; backend: 'iverilog' | 'verilator' }
  | { type: 'output'; stream: 'stdout' | 'stderr' | 'translation'; text: string }
  | {
      type: 'finish';
      code: number;
      vcdPath?: string;
      breakpointHit?: { condition: string; time: number } | null;
    };
type RtlEvent =
  | { type: 'start' }
  | { type: 'output'; stream: 'stdout' | 'stderr' | 'translation'; text: string }
  | { type: 'finish'; code: number; top?: string; moduleCount?: number };

interface OpenBenchApi {
  selectProjectFolder(): Promise<ProjectSelection | null>;
  activateProject(selection: {
    root: string;
    name: string;
    files: string[];
    suggestedTop?: string;
    suggestedSimulationTop?: string;
  }): Promise<ProjectData>;
  chooseNewProjectParent(): Promise<string | null>;
  createProject(options: {
    parent: string;
    name: string;
    withStarter: boolean;
  }): Promise<ProjectData>;
  getActiveProject(): Promise<ProjectData | null>;
  restoreProject(root: string): Promise<ProjectData | null>;
  openExampleProject(lessonId?: string): Promise<ProjectData>;
  refreshProject(): Promise<ProjectData>;
  addProjectFiles(): Promise<string[]>;
  getSettings(): Promise<ProjectSettings>;
  saveSettings(settings: ProjectSettings): Promise<ProjectSettings>;
  readFile(path: string): Promise<{ path: string; content: string }>;
  readProjectSources(): Promise<Array<{ path: string; content: string }>>;
  writeFile(path: string, content: string): Promise<{ path: string; saved: boolean }>;
  loadSession(): Promise<OpenBenchSession>;
  saveSession(value: Partial<OpenBenchSession>): Promise<OpenBenchSession>;
  loadRecoveryDraft(
    path: string,
  ): Promise<{ path: string; content: string; updatedAt: string } | null>;
  saveRecoveryDraft(path: string, content: string): Promise<void>;
  clearRecoveryDraft(path: string): Promise<void>;
  createFile(path: string, content?: string): Promise<string>;
  createFolder(path: string): Promise<string>;
  renameEntry(path: string, name: string): Promise<string>;
  removeEntry(path: string): Promise<boolean>;
  duplicateFile(path: string): Promise<string>;
  revealFile(path: string): Promise<void>;
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  composeFeedbackEmail(kind: 'feedback' | 'bug', backend: 'iverilog' | 'verilator'): Promise<void>;
  runToolchainSelfTest(): Promise<{
    ok: boolean;
    durationMs: number;
    error?: string;
    tools: Record<string, string>;
  }>;
  exportSupportBundle(options: {
    consoleText: string;
    includeSource: boolean;
  }): Promise<string | null>;
  editAction(action: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'): Promise<void>;
  runCompile(): Promise<{ code: number }>;
  runInlineLint(): Promise<{ code: number; output: string; skipped: boolean }>;
  runSimulation(breakpoints?: WaveBreakpoint[]): Promise<{
    code: number;
    vcdPath: string;
    breakpointHit?: { condition: string; time: number } | null;
  }>;
  readLatestVcd(): Promise<{ name: string; content: string }>;
  listWaveformRuns(): Promise<
    Array<{ id: string; name: string; createdAt: number; fileName: string; size: number }>
  >;
  readWaveformRun(runId: string): Promise<{ name: string; content: string }>;
  runRtl(): Promise<{ code: number; top: string; moduleCount: number }>;
  readLatestNetlist(): Promise<{
    name: string;
    top: string;
    netlist: import('./netlistGraph.js').YosysNetlist;
  }>;
  generateTestbench(
    moduleName: string,
    options?: {
      clockPeriod?: number;
      resetDuration?: number;
      finishTime?: number;
      steps?: Array<{ time: number; signal: string; value: string }>;
    },
  ): Promise<{
    path: string;
    detected: { clocks: string[]; resets: string[]; stimulusInputs: string[] };
  }>;
  onCompileEvent(listener: (event: CompileEvent) => void): () => void;
  onSimulationEvent(listener: (event: SimulationEvent) => void): () => void;
  onRtlEvent(listener: (event: RtlEvent) => void): () => void;
}

interface Window {
  openbench: OpenBenchApi;
  /** @deprecated Compatibility alias for extensions created before the OpenBench rename. */
  rtlbench: OpenBenchApi;
}
