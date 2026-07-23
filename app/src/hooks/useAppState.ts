import { useCallback, useState } from 'react';
import type { VcdData } from '../vcdParser';
import type { YosysNetlist } from '../netlistGraph';
import type {
  AccessibilityPreferences,
  ActiveView,
  ConsoleMode,
  ContextMenuState,
  OpenFile,
  PromptState,
  SimulationRun,
  SourceConcept,
  Theme,
} from '../types/ui';
import { readPreference } from '../compatibility';

export function useAppState() {
  const workspace = useWorkspaceState();
  const backend = useBackendState();
  const dialogs = useDialogState();
  const preferences = usePreferenceState();
  return { ...workspace, ...backend, ...dialogs, ...preferences };
}

function useWorkspaceState() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('source');
  const [sourceConcept, setSourceConcept] = useState<SourceConcept | null>(null);
  const [editorCursor, setEditorCursor] = useState<{
    path: string;
    line: number;
    column: number;
  } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const openFile = openFiles.find((file) => file.path === activeFilePath) || null;
  const updateOpenFile = useCallback(
    (updater: (file: OpenFile) => OpenFile) => {
      if (!activeFilePath) return;
      setOpenFiles((current) =>
        current.map((file) => (file.path === activeFilePath ? updater(file) : file)),
      );
    },
    [activeFilePath],
  );
  return {
    project,
    setProject,
    openFiles,
    setOpenFiles,
    activeFilePath,
    setActiveFilePath,
    activeView,
    setActiveView,
    sourceConcept,
    setSourceConcept,
    editorCursor,
    setEditorCursor,
    sessionReady,
    setSessionReady,
    openFile,
    updateOpenFile,
  };
}

function useBackendState() {
  const [consoleText, setConsoleText] = useState('Open an HDL project to begin.');
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('compile');
  const [compiling, setCompiling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [rtlRunning, setRtlRunning] = useState(false);
  const [waveform, setWaveform] = useState<VcdData | null>(null);
  const [waveformName, setWaveformName] = useState<string | null>(null);
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[]>([]);
  const [waveformProbe, setWaveformProbe] = useState<string | null>(null);
  const [schematicProbe, setSchematicProbe] = useState<string | null>(null);
  const [breakpoints, setBreakpoints] = useState<WaveBreakpoint[]>([]);
  const [netlist, setNetlist] = useState<YosysNetlist | null>(null);
  const [rtlTop, setRtlTop] = useState<string | null>(null);
  const [hasRunSimulation, setHasRunSimulation] = useState(false);
  const [compilePassed, setCompilePassed] = useState(false);
  const [waveformSession, setWaveformSession] = useState<WaveformSession | null>(null);
  const [lintStatus, setLintStatus] = useState<'idle' | 'checking' | 'clean' | 'issues'>('idle');
  const [status, setStatus] = useState('Ready');
  return {
    consoleText,
    setConsoleText,
    consoleMode,
    setConsoleMode,
    compiling,
    setCompiling,
    simulating,
    setSimulating,
    rtlRunning,
    setRtlRunning,
    waveform,
    setWaveform,
    waveformName,
    setWaveformName,
    simulationRuns,
    setSimulationRuns,
    waveformProbe,
    setWaveformProbe,
    schematicProbe,
    setSchematicProbe,
    breakpoints,
    setBreakpoints,
    netlist,
    setNetlist,
    rtlTop,
    setRtlTop,
    hasRunSimulation,
    setHasRunSimulation,
    compilePassed,
    setCompilePassed,
    waveformSession,
    setWaveformSession,
    lintStatus,
    setLintStatus,
    status,
    setStatus,
  };
}

function useDialogState() {
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showTutorial, setShowTutorial] = useState(
    () => readPreference('tutorialComplete') !== 'true',
  );
  const [importSelection, setImportSelection] = useState<ProjectSelection | null>(null);
  const [newProjectParent, setNewProjectParent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [watchMode, setWatchMode] = useState(false);
  const [schematicModuleFocus, setSchematicModuleFocus] = useState<string | null>(null);
  const [stimulusModule, setStimulusModule] = useState<string | null>(null);
  return {
    showSettings,
    setShowSettings,
    showHelp,
    setShowHelp,
    showAbout,
    setShowAbout,
    showGuidance,
    setShowGuidance,
    showTutorial,
    setShowTutorial,
    importSelection,
    setImportSelection,
    newProjectParent,
    setNewProjectParent,
    prompt,
    setPrompt,
    contextMenu,
    setContextMenu,
    watchMode,
    setWatchMode,
    schematicModuleFocus,
    setSchematicModuleFocus,
    stimulusModule,
    setStimulusModule,
  };
}

function usePreferenceState() {
  const [settings, setSettings] = useState<ProjectSettings>({
    topModule: '',
    simulationTop: '',
    includePaths: [],
    simulator: 'iverilog',
    toolchainPath: '',
  });
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(() => {
    const defaults = { highContrast: false, largeText: false, reduceMotion: false };
    try {
      return {
        ...defaults,
        ...JSON.parse(readPreference('accessibility') || '{}'),
      };
    } catch {
      return defaults;
    }
  });
  const [theme, setTheme] = useState<Theme>(() =>
    readPreference('theme') === 'light' ? 'light' : 'dark',
  );
  const [explorerWidth, setExplorerWidth] = useState(248);
  const [consoleHeight, setConsoleHeight] = useState(220);
  const [consoleWidth, setConsoleWidth] = useState(340);
  const [explorerDock, setExplorerDock] = useState<'left' | 'right'>(() =>
    readPreference('explorerDock') === 'right' ? 'right' : 'left',
  );
  const [consoleDock, setConsoleDock] = useState<'bottom' | 'right'>(() =>
    readPreference('consoleDock') === 'right' ? 'right' : 'bottom',
  );
  return {
    settings,
    setSettings,
    accessibility,
    setAccessibility,
    theme,
    setTheme,
    explorerWidth,
    setExplorerWidth,
    consoleHeight,
    setConsoleHeight,
    consoleWidth,
    setConsoleWidth,
    explorerDock,
    setExplorerDock,
    consoleDock,
    setConsoleDock,
  };
}

export type AppState = ReturnType<typeof useAppState>;
