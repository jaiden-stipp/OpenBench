import { loader } from '@monaco-editor/react';
import { monaco as localMonaco } from './editor/monaco';
import AppHeader from './components/AppHeader';
import AppWorkspace from './components/AppWorkspace';
import AppDialogLayer from './components/AppDialogLayer';
import { useAppState, type AppState } from './hooks/useAppState';
import { useAppRefs, type AppRefs } from './hooks/useAppRefs';
import { useAppController, type AppController } from './hooks/useAppController';

loader.config({ monaco: localMonaco });

export default function App() {
  const state = useAppState();
  const refs = useAppRefs(state);
  const controller = useAppController(state, refs);
  return <AppShell state={state} refs={refs} controller={controller} />;
}

function AppShell({ state, refs, controller }: ShellProps) {
  return (
    <div className={`app-shell ${state.theme}`}>
      <Header state={state} controller={controller} />
      <Workspace state={state} refs={refs} controller={controller} />
      <StatusBar state={state} />
      <Dialogs state={state} controller={controller} />
    </div>
  );
}

type ShellProps = { state: AppState; refs: AppRefs; controller: AppController };

function Header({ state, controller }: Omit<ShellProps, 'refs'>) {
  return (
    <AppHeader
      activeView={state.activeView}
      compiling={state.compiling}
      consoleDock={state.consoleDock}
      designTop={state.settings.topModule}
      explorerDock={state.explorerDock}
      hasRunSimulation={state.hasRunSimulation}
      menuActions={controller.menuActions}
      netlistReady={Boolean(state.netlist)}
      openFile={state.openFile}
      projectReady={Boolean(state.project)}
      rtlRunning={state.rtlRunning}
      setConsoleDock={state.setConsoleDock}
      setExplorerDock={state.setExplorerDock}
      setShowGuidance={state.setShowGuidance}
      setShowHelp={state.setShowHelp}
      setShowSettings={state.setShowSettings}
      setTheme={state.setTheme}
      setWatchMode={state.setWatchMode}
      simulating={state.simulating}
      simulationTop={state.settings.simulationTop}
      theme={state.theme}
      waveformReady={Boolean(state.waveform)}
      watchMode={state.watchMode}
      onCompile={() => void controller.runCompile()}
      onRtl={() => void controller.runRtl()}
      onSave={() => void controller.save()}
      onSimulate={() => void controller.runSimulation()}
    />
  );
}

function Workspace({ state, refs, controller }: ShellProps) {
  return (
    <AppWorkspace
      accessibility={state.accessibility}
      activeFilePath={state.activeFilePath}
      activeView={state.activeView}
      breakpoints={state.breakpoints}
      consoleDock={state.consoleDock}
      consoleHeight={state.consoleHeight}
      consoleMode={state.consoleMode}
      consoleText={state.consoleText}
      consoleWidth={state.consoleWidth}
      explorerDock={state.explorerDock}
      explorerWidth={state.explorerWidth}
      lintStatus={state.lintStatus}
      netlist={state.netlist}
      openFile={state.openFile}
      openFiles={state.openFiles}
      project={state.project}
      resizeRef={refs.resizeRef}
      rtlTop={state.rtlTop}
      schematicModuleFocus={state.schematicModuleFocus}
      schematicProbe={state.schematicProbe}
      settings={state.settings}
      simulationRuns={state.simulationRuns}
      sourceConcept={state.sourceConcept}
      theme={state.theme}
      waveform={state.waveform}
      waveformName={state.waveformName}
      waveformProbe={state.waveformProbe}
      waveformSession={state.waveformSession}
      onAddProjectFiles={() => void controller.addProjectFiles()}
      onCloseFile={(file) => void controller.closeFileTab(file)}
      onEditorMount={controller.onEditorMount}
      onNavigateWaveSignal={controller.navigateWaveSignal}
      onNavigateYosysSource={controller.navigateYosysSource}
      onLoadWaveformRun={controller.loadWaveformRun}
      onNewProject={() => void controller.beginNewProject()}
      onOpenExample={() => void controller.openExampleProject()}
      onOpenPath={(path, line, column) => void controller.openPath(path, line, column)}
      onOpenProject={() => void controller.openProject()}
      onRefreshProject={() => void controller.refreshProject()}
      setActiveFilePath={state.setActiveFilePath}
      setActiveView={state.setActiveView}
      setBreakpoints={state.setBreakpoints}
      setConsoleText={state.setConsoleText}
      setContextMenu={state.setContextMenu}
      setPrompt={state.setPrompt}
      setSchematicProbe={state.setSchematicProbe}
      setSourceConcept={state.setSourceConcept}
      setStatus={state.setStatus}
      setStimulusModule={state.setStimulusModule}
      setWaveformProbe={state.setWaveformProbe}
      setWaveformSession={state.setWaveformSession}
      updateOpenFile={state.updateOpenFile}
    />
  );
}

function StatusBar({ state }: { state: AppState }) {
  const context =
    state.activeView === 'source'
      ? (state.openFile?.path ?? 'No file selected')
      : state.activeView === 'waveform'
        ? (state.waveformName ?? 'No waveform')
        : (state.rtlTop ?? 'No RTL netlist');
  return (
    <footer>
      <span>{state.project?.root ?? 'No project'}</span>
      <span>{context}</span>
      <span className={state.status.toLowerCase().includes('failed') ? 'bad' : ''}>
        {state.status}
      </span>
    </footer>
  );
}

function Dialogs({ state, controller }: Omit<ShellProps, 'refs'>) {
  return (
    <AppDialogLayer
      accessibility={state.accessibility}
      activeView={state.activeView}
      compilePassed={state.compilePassed}
      consoleText={state.consoleText}
      contextMenu={state.contextMenu}
      importSelection={state.importSelection}
      netlist={state.netlist}
      newProjectParent={state.newProjectParent}
      project={state.project}
      projectInsights={controller.projectInsights}
      prompt={state.prompt}
      rtlTop={state.rtlTop}
      settings={state.settings}
      showAbout={state.showAbout}
      showGuidance={state.showGuidance}
      showHelp={state.showHelp}
      showSettings={state.showSettings}
      showTutorial={state.showTutorial}
      stimulusModule={state.stimulusModule}
      waveformInteracted={Boolean(state.waveformSession && state.waveformSession.cursor > 0)}
      waveformReady={Boolean(state.waveform)}
      waveformInsights={controller.waveformInsights}
      onActivateSelection={(name, files, topModule, simulationTop) =>
        void controller.activateSelection(name, files, topModule, simulationTop)
      }
      onCompleteTutorial={controller.completeTutorial}
      onComposeEmail={(kind) => void controller.composeFeedbackEmail(kind)}
      onCreateProject={(name, starter, topModule) =>
        void controller.createNewProject(name, starter, topModule)
      }
      onDuplicateProjectFile={(node) => void controller.duplicateProjectFile(node)}
      onGenerateTestbench={(module, options) => void controller.generateTestbench(module, options)}
      onOpenLearningProject={controller.openLearningProject}
      onOpenTutorialExample={() => controller.openExampleProject(true)}
      onRemoveProjectEntry={(node) => void controller.removeProjectEntry(node)}
      onSaveSettings={controller.saveProjectSettings}
      onSetDesignTop={async (moduleName) => {
        await controller.saveProjectSettings({ ...state.settings, topModule: moduleName });
        state.setStatus(`Design top set to ${moduleName}`);
      }}
      onSubmitPrompt={(value) => void controller.submitPrompt(value)}
      setAccessibility={state.setAccessibility}
      setActiveView={state.setActiveView}
      setContextMenu={state.setContextMenu}
      setImportSelection={state.setImportSelection}
      setNewProjectParent={state.setNewProjectParent}
      setPrompt={state.setPrompt}
      setSchematicModuleFocus={state.setSchematicModuleFocus}
      setShowAbout={state.setShowAbout}
      setShowGuidance={state.setShowGuidance}
      setShowHelp={state.setShowHelp}
      setShowSettings={state.setShowSettings}
      setStatus={state.setStatus}
      setStimulusModule={state.setStimulusModule}
    />
  );
}
