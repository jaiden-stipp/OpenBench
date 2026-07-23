import { useCallback, useMemo } from 'react';
import { analyzeProjectSources, explainWaveform } from '../projectInsights';
import { useBackendEvents } from './useBackendEvents';
import { useLayoutPreferences } from './useLayoutPreferences';
import { useWaveformWorker } from './useWaveformWorker';
import { useLearningProjectActions, useProjectPickerActions } from './useProjectLifecycleActions';
import { useSessionRestore, useSessionSave } from './useSessionPersistence';
import { useProjectSettings } from './useProjectSettings';
import {
  useFileTabActions,
  useProjectEntryActions,
  useProjectPromptActions,
} from './useProjectEntryActions';
import { useFilePersistence, useInlineLint } from './useFilePersistence';
import { useRunActions, useCrossProbeActions } from './useRunActions';
import { useAppShortcuts } from './useAppShortcuts';
import { useDismissContextMenu, useEditorIntegration } from './useEditorIntegration';
import {
  useLoadProject,
  useOpenPath,
  useProjectSources,
  useWaveformHistory,
} from './useProjectWorkspace';
import type { AppState } from './useAppState';
import type { AppRefs } from './useAppRefs';

export function useAppController(state: AppState, refs: AppRefs) {
  const workspace = useWorkspaceModel(state, refs);
  useAppServices(state, refs, workspace.loadProject);
  const projects = useProjectCommands(state, workspace);
  const execution = useExecutionCommands(state, refs, workspace);
  const editor = useEditorCommands(state, refs);
  useAppKeyboard(state, projects, execution);
  const composeFeedbackEmail = useFeedbackAction(state);
  const menuActions = useMenuActions(state, refs, projects, execution, composeFeedbackEmail);
  return { ...workspace, ...projects, ...execution, ...editor, composeFeedbackEmail, menuActions };
}

function useWorkspaceModel(state: AppState, refs: AppRefs) {
  const projectSources = useProjectSources(state.project);
  const loadWaveformRun = useWaveformHistory(
    state.project,
    refs.waveformWorkerRef,
    refs.projectGenerationRef,
    state.setSimulationRuns,
    state.setStatus,
  );
  const projectInsights = useMemo(
    () => analyzeProjectSources(projectSources, state.settings),
    [projectSources, state.settings],
  );
  const waveformInsights = useMemo(() => explainWaveform(state.waveform), [state.waveform]);
  const openPath = useOpenPath({
    editorCursor: state.editorCursor,
    editorRef: refs.editorRef,
    openFilesRef: refs.openFilesRef,
    setActiveFilePath: state.setActiveFilePath,
    setActiveView: state.setActiveView,
    setOpenFiles: state.setOpenFiles,
    setStatus: state.setStatus,
  });
  const loadProject = useLoadProject({
    projectGenerationRef: refs.projectGenerationRef,
    setActiveFilePath: state.setActiveFilePath,
    setActiveView: state.setActiveView,
    setBreakpoints: state.setBreakpoints,
    setCompilePassed: state.setCompilePassed,
    setConsoleText: state.setConsoleText,
    setHasRunSimulation: state.setHasRunSimulation,
    setNetlist: state.setNetlist,
    setOpenFiles: state.setOpenFiles,
    setProject: state.setProject,
    setRtlTop: state.setRtlTop,
    setSettings: state.setSettings,
    setSimulationRuns: state.setSimulationRuns,
    setStatus: state.setStatus,
    setWaveform: state.setWaveform,
    setWaveformName: state.setWaveformName,
    setWaveformSession: state.setWaveformSession,
  });
  return {
    projectSources,
    loadWaveformRun,
    projectInsights,
    waveformInsights,
    openPath,
    loadProject,
  };
}

type Workspace = ReturnType<typeof useWorkspaceModel>;

function useAppServices(state: AppState, refs: AppRefs, loadProject: Workspace['loadProject']) {
  useWaveformWorker({
    pendingBreakpointHitRef: refs.pendingBreakpointHitRef,
    pendingRunSourcesRef: refs.pendingRunSourcesRef,
    projectGenerationRef: refs.projectGenerationRef,
    setActiveView: state.setActiveView,
    setSimulationRuns: state.setSimulationRuns,
    setStatus: state.setStatus,
    setWaveform: state.setWaveform,
    setWaveformName: state.setWaveformName,
    waveformWorkerRef: refs.waveformWorkerRef,
  });
  useLayoutPreferences({
    accessibility: state.accessibility,
    consoleDock: state.consoleDock,
    explorerDock: state.explorerDock,
    resizeRef: refs.resizeRef,
    setConsoleHeight: state.setConsoleHeight,
    setConsoleWidth: state.setConsoleWidth,
    setExplorerWidth: state.setExplorerWidth,
    theme: state.theme,
  });
  useSessionSave({
    activeFilePath: state.activeFilePath,
    activeView: state.activeView,
    editorCursor: state.editorCursor,
    openFiles: state.openFiles,
    projectRoot: state.project?.root,
    sessionReady: state.sessionReady,
    waveformSession: state.waveformSession,
  });
  useBackendEvents({
    setCompiling: state.setCompiling,
    setCompilePassed: state.setCompilePassed,
    setConsoleMode: state.setConsoleMode,
    setConsoleText: state.setConsoleText,
    setLintStatus: state.setLintStatus,
    setRtlRunning: state.setRtlRunning,
    setShowGuidance: state.setShowGuidance,
    setSimulating: state.setSimulating,
    setStatus: state.setStatus,
  });
  useSessionRestore({
    loadProject,
    projectGenerationRef: refs.projectGenerationRef,
    setActiveFilePath: state.setActiveFilePath,
    setActiveView: state.setActiveView,
    setEditorCursor: state.setEditorCursor,
    setNetlist: state.setNetlist,
    setOpenFiles: state.setOpenFiles,
    setRtlTop: state.setRtlTop,
    setSessionReady: state.setSessionReady,
    setStatus: state.setStatus,
    setWaveformSession: state.setWaveformSession,
    waveformWorkerRef: refs.waveformWorkerRef,
  });
}

function useProjectCommands(state: AppState, workspace: Workspace) {
  const picker = useProjectPickerActions({
    activeProjectRoot: state.project?.root,
    importSelection: state.importSelection,
    loadProject: workspace.loadProject,
    newProjectParent: state.newProjectParent,
    openPath: workspace.openPath,
    setImportSelection: state.setImportSelection,
    setNewProjectParent: state.setNewProjectParent,
    setStatus: state.setStatus,
  });
  const learning = useLearningProjectActions({
    loadProject: workspace.loadProject,
    openPath: workspace.openPath,
    setShowGuidance: state.setShowGuidance,
    setShowTutorial: state.setShowTutorial,
    setStatus: state.setStatus,
  });
  const entries = useProjectEntryActions({
    activeFilePath: state.activeFilePath,
    openFiles: state.openFiles,
    openPath: workspace.openPath,
    setActiveFilePath: state.setActiveFilePath,
    setContextMenu: state.setContextMenu,
    setOpenFiles: state.setOpenFiles,
    setProject: state.setProject,
    setStatus: state.setStatus,
  });
  const prompts = useProjectPromptActions({
    activeFilePath: state.activeFilePath,
    openPath: workspace.openPath,
    prompt: state.prompt,
    refreshProject: entries.refreshProject,
    setActiveFilePath: state.setActiveFilePath,
    setOpenFiles: state.setOpenFiles,
    setPrompt: state.setPrompt,
    setStatus: state.setStatus,
  });
  const { closeFileTab } = useFileTabActions(
    state.openFiles,
    state.activeFilePath,
    state.setOpenFiles,
    state.setActiveFilePath,
  );
  return { ...picker, ...learning, ...entries, ...prompts, closeFileTab };
}

type Projects = ReturnType<typeof useProjectCommands>;

function useExecutionCommands(state: AppState, refs: AppRefs, workspace: Workspace) {
  const runInlineLint = useInlineLint({
    lintRequestRef: refs.lintRequestRef,
    setLintStatus: state.setLintStatus,
  });
  const persistence = useFilePersistence({
    hasRunSimulation: state.hasRunSimulation,
    openFile: state.openFile,
    openFiles: state.openFiles,
    project: state.project,
    runInlineLint,
    setOpenFiles: state.setOpenFiles,
    setStatus: state.setStatus,
    updateOpenFile: state.updateOpenFile,
    watchMode: state.watchMode,
    watchRunRef: refs.watchRunRef,
    watchTimerRef: refs.watchTimerRef,
  });
  const runs = useRunActions({
    breakpoints: state.breakpoints,
    openFiles: state.openFiles,
    pendingBreakpointHitRef: refs.pendingBreakpointHitRef,
    pendingRunSourcesRef: refs.pendingRunSourcesRef,
    projectSources: workspace.projectSources,
    projectGenerationRef: refs.projectGenerationRef,
    saveAllDirtyFiles: persistence.saveAllDirtyFiles,
    setActiveView: state.setActiveView,
    setCompiling: state.setCompiling,
    setConsoleText: state.setConsoleText,
    setHasRunSimulation: state.setHasRunSimulation,
    setNetlist: state.setNetlist,
    setRtlRunning: state.setRtlRunning,
    setRtlTop: state.setRtlTop,
    setShowGuidance: state.setShowGuidance,
    setSimulating: state.setSimulating,
    setStatus: state.setStatus,
    waveformWorkerRef: refs.waveformWorkerRef,
  });
  refs.watchRunRef.current = runs.runSimulation;
  const crossProbe = useCrossProbeActions({
    netlist: state.netlist,
    openPath: workspace.openPath,
    project: state.project,
    setActiveView: state.setActiveView,
    setConsoleText: state.setConsoleText,
    setProject: state.setProject,
    setSchematicProbe: state.setSchematicProbe,
    setStatus: state.setStatus,
  });
  const saveProjectSettings = useProjectSettings({
    settings: state.settings,
    setHasRunSimulation: state.setHasRunSimulation,
    setNetlist: state.setNetlist,
    setRtlTop: state.setRtlTop,
    setSettings: state.setSettings,
    setStatus: state.setStatus,
    setWaveform: state.setWaveform,
    setWaveformName: state.setWaveformName,
    setWaveformSession: state.setWaveformSession,
  });
  return { ...persistence, ...runs, ...crossProbe, saveProjectSettings };
}

type Execution = ReturnType<typeof useExecutionCommands>;

function useEditorCommands(state: AppState, refs: AppRefs) {
  const { onEditorMount } = useEditorIntegration({
    activeFilePath: state.activeFilePath,
    activeFilePathRef: refs.activeFilePathRef,
    editorCursor: state.editorCursor,
    editorRef: refs.editorRef,
    setEditorCursor: state.setEditorCursor,
    setImportSelection: state.setImportSelection,
    setNewProjectParent: state.setNewProjectParent,
    setSourceConcept: state.setSourceConcept,
    updateOpenFile: state.updateOpenFile,
  });
  useDismissContextMenu(state.setContextMenu);
  return { onEditorMount };
}

function useAppKeyboard(state: AppState, projects: Projects, execution: Execution) {
  useAppShortcuts({
    activeView: state.activeView,
    beginNewProject: projects.beginNewProject,
    busy: state.compiling || state.simulating || state.rtlRunning,
    openProject: projects.openProject,
    projectReady: Boolean(state.project),
    runCompile: execution.runCompile,
    runRtl: execution.runRtl,
    runSimulation: execution.runSimulation,
    setPrompt: state.setPrompt,
  });
}

function useFeedbackAction(state: AppState) {
  const { setStatus } = state;
  const simulator = state.settings.simulator;
  return useCallback(
    async (kind: 'feedback' | 'bug') => {
      try {
        await window.rtldeck.composeFeedbackEmail(kind, simulator);
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
    },
    [setStatus, simulator],
  );
}

function useMenuActions(
  state: AppState,
  refs: AppRefs,
  projects: Projects,
  execution: Execution,
  feedback: (kind: 'feedback' | 'bug') => Promise<void>,
) {
  return useMemo<Record<string, () => void>>(
    () => ({
      newProject: () => void projects.beginNewProject(),
      openProject: () => void projects.openProject(),
      newFile: () => state.setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' }),
      newFolder: () => state.setPrompt({ kind: 'new-folder', initialValue: 'rtl' }),
      addFiles: () => void projects.addProjectFiles(),
      stimulus: () => {
        if (state.rtlTop) state.setStimulusModule(state.rtlTop);
        else {
          state.setActiveView('schematic');
          state.setStatus(
            'Run RTL Analysis, then generate a starter testbench for the design top.',
          );
        }
      },
      save: () => void execution.save(),
      saveAll: () => void execution.saveAllDirtyFiles(),
      settings: () => state.setShowSettings(true),
      close: () => void window.rtldeck.windowAction('close'),
      undo: () => refs.editorRef.current?.trigger('menu', 'undo', null),
      redo: () => refs.editorRef.current?.trigger('menu', 'redo', null),
      cut: () => refs.editorRef.current?.trigger('menu', 'editor.action.clipboardCutAction', null),
      copy: () =>
        refs.editorRef.current?.trigger('menu', 'editor.action.clipboardCopyAction', null),
      paste: () =>
        refs.editorRef.current?.trigger('menu', 'editor.action.clipboardPasteAction', null),
      selectAll: () => refs.editorRef.current?.trigger('menu', 'editor.action.selectAll', null),
      source: () => state.setActiveView('source'),
      waveform: () => state.setActiveView('waveform'),
      schematic: () => state.setActiveView('schematic'),
      zoomIn: () => window.dispatchEvent(new CustomEvent('rtldeck:wave-zoom', { detail: 0.5 })),
      zoomOut: () => window.dispatchEvent(new CustomEvent('rtldeck:wave-zoom', { detail: 2 })),
      theme: () => state.setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
      explorerLeft: () => state.setExplorerDock('left'),
      explorerRight: () => state.setExplorerDock('right'),
      consoleBottom: () => state.setConsoleDock('bottom'),
      consoleRight: () => state.setConsoleDock('right'),
      watch: () => state.setWatchMode((value) => !value),
      minimize: () => void window.rtldeck.windowAction('minimize'),
      maximize: () => void window.rtldeck.windowAction('maximize'),
      tutorial: () => state.setShowTutorial(true),
      guidance: () => state.setShowGuidance(true),
      example: () => void projects.openExampleProject(),
      help: () => state.setShowHelp(true),
      feedback: () => void feedback('feedback'),
      reportBug: () => void feedback('bug'),
      about: () => state.setShowAbout(true),
    }),
    [execution, feedback, projects, refs.editorRef, state],
  );
}

export type AppController = ReturnType<typeof useAppController>;
