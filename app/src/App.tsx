import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loader } from '@monaco-editor/react';
import * as localMonaco from 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { VcdData } from './vcdParser.js';
import type { YosysNetlist } from './netlistGraph.js';
import { analyzeProjectSources, explainWaveform } from './projectInsights.js';
import { readPreference } from './compatibility';
import AppHeader from './components/AppHeader';
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
} from './types/ui';
import { useBackendEvents } from './hooks/useBackendEvents';
import { useLayoutPreferences, type ResizeState } from './hooks/useLayoutPreferences';
import { useWaveformWorker } from './hooks/useWaveformWorker';
import {
  useLearningProjectActions,
  useProjectPickerActions,
} from './hooks/useProjectLifecycleActions';
import { useSessionRestore, useSessionSave } from './hooks/useSessionPersistence';
import { useProjectSettings } from './hooks/useProjectSettings';
import AppWorkspace from './components/AppWorkspace';
import {
  useFileTabActions,
  useProjectEntryActions,
  useProjectPromptActions,
} from './hooks/useProjectEntryActions';
import { useCrossProbeActions, useRunActions } from './hooks/useRunActions';
import { useFilePersistence, useInlineLint } from './hooks/useFilePersistence';
import { useDismissContextMenu, useEditorIntegration } from './hooks/useEditorIntegration';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import {
  useLoadProject,
  useOpenPath,
  useProjectSources,
  useWaveformHistory,
} from './hooks/useProjectWorkspace';
import AppDialogLayer from './components/AppDialogLayer';

loader.config({ monaco: localMonaco });
export default function App() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [consoleText, setConsoleText] = useState('Open an HDL project to begin.');
  const [compiling, setCompiling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [rtlRunning, setRtlRunning] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('source');
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('compile');
  const [waveform, setWaveform] = useState<VcdData | null>(null);
  const [waveformName, setWaveformName] = useState<string | null>(null);
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[]>([]);
  const [waveformProbe, setWaveformProbe] = useState<string | null>(null);
  const [schematicProbe, setSchematicProbe] = useState<string | null>(null);
  const [breakpoints, setBreakpoints] = useState<WaveBreakpoint[]>([]);
  const [netlist, setNetlist] = useState<YosysNetlist | null>(null);
  const [rtlTop, setRtlTop] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>({
    topModule: '',
    simulationTop: '',
    includePaths: [],
    simulator: 'iverilog',
    toolchainPath: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showTutorial, setShowTutorial] = useState(
    () => localStorage.getItem('openbench.tutorialComplete') !== 'true',
  );
  const [importSelection, setImportSelection] = useState<ProjectSelection | null>(null);
  const [newProjectParent, setNewProjectParent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sourceConcept, setSourceConcept] = useState<SourceConcept | null>(null);
  const [watchMode, setWatchMode] = useState(false);
  const [hasRunSimulation, setHasRunSimulation] = useState(false);
  const [compilePassed, setCompilePassed] = useState(false);
  const [schematicModuleFocus, setSchematicModuleFocus] = useState<string | null>(null);
  const [stimulusModule, setStimulusModule] = useState<string | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(() => {
    const defaults = { highContrast: false, largeText: false, reduceMotion: false };
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem('openbench.accessibility') || '{}'),
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
  const [status, setStatus] = useState('Ready');
  const [waveformSession, setWaveformSession] = useState<WaveformSession | null>(null);
  const [editorCursor, setEditorCursor] = useState<{
    path: string;
    line: number;
    column: number;
  } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [lintStatus, setLintStatus] = useState<'idle' | 'checking' | 'clean' | 'issues'>('idle');
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
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const waveformWorkerRef = useRef<Worker | null>(null);
  const pendingBreakpointHitRef = useRef<{ condition: string; time: number } | null>(null);
  const pendingRunSourcesRef = useRef<Record<string, string>>({});
  const watchRunRef = useRef<(() => Promise<void>) | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const lintRequestRef = useRef(0);
  const activeFilePathRef = useRef<string | null>(null);
  const openFilesRef = useRef<OpenFile[]>([]);

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  const projectSources = useProjectSources(project);
  const loadWaveformRun = useWaveformHistory(
    project,
    waveformWorkerRef,
    setSimulationRuns,
    setStatus,
  );

  const projectInsights = useMemo(
    () => analyzeProjectSources(projectSources, settings),
    [projectSources, settings],
  );
  const waveformInsights = useMemo(() => explainWaveform(waveform), [waveform]);

  useWaveformWorker({
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    setActiveView,
    setSimulationRuns,
    setStatus,
    setWaveform,
    setWaveformName,
    waveformWorkerRef,
  });

  useLayoutPreferences({
    accessibility,
    consoleDock,
    explorerDock,
    resizeRef,
    setConsoleHeight,
    setConsoleWidth,
    setExplorerWidth,
    theme,
  });

  useSessionSave({
    activeFilePath,
    activeView,
    editorCursor,
    openFiles,
    projectRoot: project?.root,
    sessionReady,
    waveformSession,
  });

  useBackendEvents({
    setCompiling,
    setCompilePassed,
    setConsoleMode,
    setConsoleText,
    setLintStatus,
    setRtlRunning,
    setShowGuidance,
    setSimulating,
    setStatus,
  });

  const openPath = useOpenPath({
    editorCursor,
    editorRef,
    openFilesRef,
    setActiveFilePath,
    setActiveView,
    setOpenFiles,
    setStatus,
  });
  const loadProject = useLoadProject({
    setActiveFilePath,
    setActiveView,
    setBreakpoints,
    setCompilePassed,
    setConsoleText,
    setHasRunSimulation,
    setNetlist,
    setOpenFiles,
    setProject,
    setRtlTop,
    setSettings,
    setSimulationRuns,
    setStatus,
    setWaveform,
    setWaveformName,
    setWaveformSession,
  });

  useSessionRestore({
    loadProject,
    setActiveFilePath,
    setActiveView,
    setEditorCursor,
    setNetlist,
    setOpenFiles,
    setRtlTop,
    setSessionReady,
    setStatus,
    setWaveformSession,
    waveformWorkerRef,
  });

  const { activateSelection, beginNewProject, createNewProject, openProject } =
    useProjectPickerActions({
      importSelection,
      loadProject,
      newProjectParent,
      openPath,
      setImportSelection,
      setNewProjectParent,
      setStatus,
    });
  const { completeTutorial, openExampleProject, openLearningProject } = useLearningProjectActions({
    loadProject,
    openPath,
    setShowGuidance,
    setShowTutorial,
    setStatus,
  });

  const { addProjectFiles, duplicateProjectFile, refreshProject, removeProjectEntry } =
    useProjectEntryActions({
      activeFilePath,
      openFiles,
      openPath,
      setActiveFilePath,
      setContextMenu,
      setOpenFiles,
      setProject,
      setStatus,
    });
  const { submitPrompt } = useProjectPromptActions({
    activeFilePath,
    openPath,
    prompt,
    refreshProject,
    setActiveFilePath,
    setOpenFiles,
    setPrompt,
    setStatus,
  });
  const { closeFileTab } = useFileTabActions(
    openFiles,
    activeFilePath,
    setOpenFiles,
    setActiveFilePath,
  );

  const runInlineLint = useInlineLint({ lintRequestRef, setLintStatus });
  const { save, saveAllDirtyFiles } = useFilePersistence({
    hasRunSimulation,
    openFile,
    openFiles,
    project,
    runInlineLint,
    setOpenFiles,
    setStatus,
    updateOpenFile,
    watchMode,
    watchRunRef,
    watchTimerRef,
  });

  const { runCompile, runRtl, runSimulation } = useRunActions({
    breakpoints,
    openFiles,
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    projectSources,
    saveAllDirtyFiles,
    setActiveView,
    setCompiling,
    setConsoleText,
    setHasRunSimulation,
    setNetlist,
    setRtlRunning,
    setRtlTop,
    setShowGuidance,
    setSimulating,
    setStatus,
    waveformWorkerRef,
  });
  watchRunRef.current = runSimulation;
  const { generateTestbench, navigateWaveSignal, navigateYosysSource } = useCrossProbeActions({
    netlist,
    openPath,
    project,
    setActiveView,
    setConsoleText,
    setProject,
    setSchematicProbe,
    setStatus,
  });
  const saveProjectSettings = useProjectSettings({
    settings,
    setHasRunSimulation,
    setNetlist,
    setRtlTop,
    setSettings,
    setStatus,
    setWaveform,
    setWaveformName,
    setWaveformSession,
  });

  useAppShortcuts({
    activeView,
    beginNewProject,
    busy: compiling || simulating || rtlRunning,
    openProject,
    projectReady: Boolean(project),
    runCompile,
    runRtl,
    runSimulation,
    setPrompt,
  });
  const { onEditorMount } = useEditorIntegration({
    activeFilePath,
    activeFilePathRef,
    editorCursor,
    editorRef,
    setEditorCursor,
    setImportSelection,
    setNewProjectParent,
    setSourceConcept,
    updateOpenFile,
  });
  useDismissContextMenu(setContextMenu);

  const composeFeedbackEmail = async (kind: 'feedback' | 'bug') => {
    try {
      await window.openbench.composeFeedbackEmail(kind, settings.simulator);
      setStatus(
        kind === 'bug'
          ? 'Opened bug report in your email app'
          : 'Opened feedback in your email app',
      );
    } catch (error) {
      setStatus(
        `Could not open your email app: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const menuActions: Record<string, () => void> = {
    newProject: () => void beginNewProject(),
    openProject: () => void openProject(),
    newFile: () => setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' }),
    newFolder: () => setPrompt({ kind: 'new-folder', initialValue: 'rtl' }),
    addFiles: () => void addProjectFiles(),
    save: () => void save(),
    settings: () => setShowSettings(true),
    close: () => void window.openbench.windowAction('close'),
    undo: () => editorRef.current?.trigger('menu', 'undo', null),
    redo: () => editorRef.current?.trigger('menu', 'redo', null),
    cut: () => editorRef.current?.trigger('menu', 'editor.action.clipboardCutAction', null),
    copy: () => editorRef.current?.trigger('menu', 'editor.action.clipboardCopyAction', null),
    paste: () => editorRef.current?.trigger('menu', 'editor.action.clipboardPasteAction', null),
    selectAll: () => editorRef.current?.trigger('menu', 'editor.action.selectAll', null),
    source: () => setActiveView('source'),
    waveform: () => setActiveView('waveform'),
    schematic: () => setActiveView('schematic'),
    zoomIn: () => window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 0.5 })),
    zoomOut: () => window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 2 })),
    theme: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
    explorerLeft: () => setExplorerDock('left'),
    explorerRight: () => setExplorerDock('right'),
    consoleBottom: () => setConsoleDock('bottom'),
    consoleRight: () => setConsoleDock('right'),
    watch: () => setWatchMode((value) => !value),
    minimize: () => void window.openbench.windowAction('minimize'),
    maximize: () => void window.openbench.windowAction('maximize'),
    tutorial: () => setShowTutorial(true),
    guidance: () => setShowGuidance(true),
    example: () => void openExampleProject(),
    help: () => setShowHelp(true),
    feedback: () => void composeFeedbackEmail('feedback'),
    reportBug: () => void composeFeedbackEmail('bug'),
    about: () => setShowAbout(true),
  };

  return (
    <div className={`app-shell ${theme}`}>
      <svg className="logo-filter-defs" aria-hidden="true" focusable="false">
        <filter id="openbench-logo-dark" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope="-6.96875" intercept="1" />
            <feFuncG type="linear" slope="-0.62420" intercept="1" />
            <feFuncB type="linear" slope="-0.57407" intercept="1" />
            <feFuncA type="identity" />
          </feComponentTransfer>
        </filter>
      </svg>
      <AppHeader
        activeView={activeView}
        compiling={compiling}
        consoleDock={consoleDock}
        explorerDock={explorerDock}
        hasRunSimulation={hasRunSimulation}
        menuActions={menuActions}
        netlistReady={Boolean(netlist)}
        openFile={openFile}
        projectReady={Boolean(project)}
        rtlRunning={rtlRunning}
        setConsoleDock={setConsoleDock}
        setExplorerDock={setExplorerDock}
        setShowGuidance={setShowGuidance}
        setShowHelp={setShowHelp}
        setShowSettings={setShowSettings}
        setTheme={setTheme}
        setWatchMode={setWatchMode}
        simulating={simulating}
        theme={theme}
        waveformReady={Boolean(waveform)}
        watchMode={watchMode}
        onCompile={() => void runCompile()}
        onRtl={() => void runRtl()}
        onSave={() => void save()}
        onSimulate={() => void runSimulation()}
      />
      <AppWorkspace
        accessibility={accessibility}
        activeFilePath={activeFilePath}
        activeView={activeView}
        breakpoints={breakpoints}
        consoleDock={consoleDock}
        consoleHeight={consoleHeight}
        consoleMode={consoleMode}
        consoleText={consoleText}
        consoleWidth={consoleWidth}
        explorerDock={explorerDock}
        explorerWidth={explorerWidth}
        lintStatus={lintStatus}
        netlist={netlist}
        openFile={openFile}
        openFiles={openFiles}
        project={project}
        resizeRef={resizeRef}
        rtlTop={rtlTop}
        schematicModuleFocus={schematicModuleFocus}
        schematicProbe={schematicProbe}
        settings={settings}
        simulationRuns={simulationRuns}
        sourceConcept={sourceConcept}
        theme={theme}
        waveform={waveform}
        waveformName={waveformName}
        waveformProbe={waveformProbe}
        waveformSession={waveformSession}
        onAddProjectFiles={() => void addProjectFiles()}
        onCloseFile={(file) => void closeFileTab(file)}
        onEditorMount={onEditorMount}
        onNavigateWaveSignal={navigateWaveSignal}
        onNavigateYosysSource={navigateYosysSource}
        onLoadWaveformRun={loadWaveformRun}
        onNewProject={() => void beginNewProject()}
        onOpenExample={() => void openExampleProject()}
        onOpenPath={(path, line, column) => void openPath(path, line, column)}
        onOpenProject={() => void openProject()}
        onRefreshProject={() => void refreshProject()}
        setActiveFilePath={setActiveFilePath}
        setActiveView={setActiveView}
        setBreakpoints={setBreakpoints}
        setConsoleText={setConsoleText}
        setContextMenu={setContextMenu}
        setPrompt={setPrompt}
        setSchematicProbe={setSchematicProbe}
        setSourceConcept={setSourceConcept}
        setStatus={setStatus}
        setStimulusModule={setStimulusModule}
        setWaveformProbe={setWaveformProbe}
        setWaveformSession={setWaveformSession}
        updateOpenFile={updateOpenFile}
      />
      <footer>
        <span>{project?.root ?? 'No project'}</span>
        <span>
          {activeView === 'source'
            ? (openFile?.path ?? 'No file selected')
            : activeView === 'waveform'
              ? (waveformName ?? 'No waveform')
              : (rtlTop ?? 'No RTL netlist')}
        </span>
        <span className={status.toLowerCase().includes('failed') ? 'bad' : ''}>{status}</span>
      </footer>
      <AppDialogLayer
        accessibility={accessibility}
        activeView={activeView}
        compilePassed={compilePassed}
        consoleText={consoleText}
        contextMenu={contextMenu}
        importSelection={importSelection}
        netlist={netlist}
        newProjectParent={newProjectParent}
        project={project}
        projectInsights={projectInsights}
        prompt={prompt}
        rtlTop={rtlTop}
        settings={settings}
        showAbout={showAbout}
        showGuidance={showGuidance}
        showHelp={showHelp}
        showSettings={showSettings}
        showTutorial={showTutorial}
        stimulusModule={stimulusModule}
        waveformInteracted={Boolean(waveformSession && waveformSession.cursor > 0)}
        waveformReady={Boolean(waveform)}
        waveformInsights={waveformInsights}
        onActivateSelection={(name, files) => void activateSelection(name, files)}
        onCompleteTutorial={completeTutorial}
        onComposeEmail={(kind) => void composeFeedbackEmail(kind)}
        onCreateProject={(name, starter) => void createNewProject(name, starter)}
        onDuplicateProjectFile={(node) => void duplicateProjectFile(node)}
        onGenerateTestbench={(module, options) => void generateTestbench(module, options)}
        onOpenLearningProject={openLearningProject}
        onOpenTutorialExample={() => openExampleProject(true)}
        onRemoveProjectEntry={(node) => void removeProjectEntry(node)}
        onSaveSettings={saveProjectSettings}
        onSubmitPrompt={(value) => void submitPrompt(value)}
        setAccessibility={setAccessibility}
        setActiveView={setActiveView}
        setContextMenu={setContextMenu}
        setImportSelection={setImportSelection}
        setNewProjectParent={setNewProjectParent}
        setPrompt={setPrompt}
        setSchematicModuleFocus={setSchematicModuleFocus}
        setShowAbout={setShowAbout}
        setShowGuidance={setShowGuidance}
        setShowHelp={setShowHelp}
        setShowSettings={setShowSettings}
        setStatus={setStatus}
        setStimulusModule={setStimulusModule}
      />
    </div>
  );
}
