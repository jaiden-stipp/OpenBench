import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import ProjectExplorer from './ProjectExplorer';
import OutputConsole from './OutputConsole';
import { FileTabs, ViewTabs } from './WorkspaceTabs';
import WaveformPanel from '../WaveformPanel';
import SchematicPanel from '../SchematicPanel';
import { configureSystemVerilog } from '../editor/systemVerilog';
import type { VcdData, VcdSignal } from '../vcdParser';
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
import type { ResizeState } from '../hooks/useLayoutPreferences';

export type AppWorkspaceProps = {
  accessibility: AccessibilityPreferences;
  activeFilePath: string | null;
  activeView: ActiveView;
  breakpoints: WaveBreakpoint[];
  consoleDock: 'bottom' | 'right';
  consoleHeight: number;
  consoleMode: ConsoleMode;
  consoleText: string;
  consoleWidth: number;
  explorerDock: 'left' | 'right';
  explorerWidth: number;
  lintStatus: 'idle' | 'checking' | 'clean' | 'issues';
  netlist: YosysNetlist | null;
  openFile: OpenFile | null;
  openFiles: OpenFile[];
  project: ProjectData | null;
  resizeRef: MutableRefObject<ResizeState | null>;
  rtlTop: string | null;
  schematicModuleFocus: string | null;
  schematicProbe: string | null;
  settings: ProjectSettings;
  simulationRuns: SimulationRun[];
  sourceConcept: SourceConcept | null;
  theme: Theme;
  waveform: VcdData | null;
  waveformName: string | null;
  waveformProbe: string | null;
  waveformSession: WaveformSession | null;
  onAddProjectFiles: () => void;
  onCloseFile: (file: OpenFile) => void;
  onEditorMount: OnMount;
  onNavigateWaveSignal: (signal: VcdSignal) => void;
  onNavigateYosysSource: (source: string) => void;
  onLoadWaveformRun: (runId: string) => Promise<void>;
  onNewProject: () => void;
  onOpenExample: () => void;
  onOpenPath: (path: string, line?: number, column?: number) => void;
  onOpenProject: () => void;
  onRefreshProject: () => void;
  setActiveFilePath: Dispatch<SetStateAction<string | null>>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setBreakpoints: Dispatch<SetStateAction<WaveBreakpoint[]>>;
  setConsoleText: Dispatch<SetStateAction<string>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setPrompt: Dispatch<SetStateAction<PromptState | null>>;
  setSchematicProbe: Dispatch<SetStateAction<string | null>>;
  setSourceConcept: Dispatch<SetStateAction<SourceConcept | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setStimulusModule: Dispatch<SetStateAction<string | null>>;
  setWaveformProbe: Dispatch<SetStateAction<string | null>>;
  setWaveformSession: Dispatch<SetStateAction<WaveformSession | null>>;
  updateOpenFile: (updater: (file: OpenFile) => OpenFile) => void;
};

export default function AppWorkspace(props: AppWorkspaceProps) {
  const columns =
    props.explorerDock === 'left'
      ? `${props.explorerWidth}px 4px minmax(0, 1fr)`
      : `minmax(0, 1fr) 4px ${props.explorerWidth}px`;
  const areas =
    props.explorerDock === 'left'
      ? '"explorer explorerSplitter center"'
      : '"center explorerSplitter explorer"';
  return (
    <main className="workspace" style={{ gridTemplateColumns: columns, gridTemplateAreas: areas }}>
      <ProjectExplorer
        project={props.project}
        onOpenFile={(path) => props.onOpenPath(path)}
        onOpenContextMenu={(node, x, y) => props.setContextMenu({ node, x, y })}
        onNewFile={() => props.setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' })}
        onNewFolder={() => props.setPrompt({ kind: 'new-folder', initialValue: 'rtl' })}
        onAddFiles={props.onAddProjectFiles}
        onRefresh={props.onRefreshProject}
        onOpenExample={props.onOpenExample}
        onNewProject={props.onNewProject}
        onOpenProject={props.onOpenProject}
      />
      <ExplorerSplitter {...props} />
      <CenterWorkspace {...props} />
    </main>
  );
}

function ExplorerSplitter(props: AppWorkspaceProps) {
  return (
    <div
      className="splitter vertical"
      style={{ gridArea: 'explorerSplitter' }}
      onPointerDown={(event) => {
        props.resizeRef.current = {
          kind: 'explorer',
          start: event.clientX,
          size: props.explorerWidth,
          direction: props.explorerDock === 'left' ? 1 : -1,
        };
        document.body.classList.add('resizing');
      }}
    />
  );
}

function CenterWorkspace(props: AppWorkspaceProps) {
  const style =
    props.consoleDock === 'bottom'
      ? {
          gridArea: 'center',
          gridTemplateRows: `minmax(280px, 1fr) 4px ${props.consoleHeight}px`,
          gridTemplateAreas: '"editor" "consoleSplitter" "console"',
        }
      : {
          gridArea: 'center',
          gridTemplateColumns: `minmax(400px, 1fr) 4px ${props.consoleWidth}px`,
          gridTemplateAreas: '"editor consoleSplitter console"',
        };
  return (
    <section className={`center-column console-${props.consoleDock}`} style={style}>
      <EditorWorkspace {...props} />
      <ConsoleSplitter {...props} />
      <OutputConsole
        mode={props.consoleMode}
        text={props.consoleText}
        onClear={() => props.setConsoleText('')}
        onOpenSource={props.onOpenPath}
      />
    </section>
  );
}

function EditorWorkspace(props: AppWorkspaceProps) {
  return (
    <div
      className={`editor-panel panel ${props.activeView === 'source' && props.openFiles.length ? 'with-file-tabs' : ''}`}
      style={{ gridArea: 'editor' }}
    >
      <ViewTabs
        activeView={props.activeView}
        waveformSignalCount={props.waveform?.signals.length ?? null}
        rtlTop={props.rtlTop}
        lintStatus={props.lintStatus}
        onSelectView={props.setActiveView}
      />
      {props.activeView === 'source' && props.openFiles.length > 0 && (
        <FileTabs
          files={props.openFiles}
          activeFilePath={props.activeFilePath}
          onSelectFile={(path) => {
            props.setActiveFilePath(path);
            props.setActiveView('source');
          }}
          onCloseFile={props.onCloseFile}
        />
      )}
      <ActiveWorkspaceView {...props} />
      {props.activeView === 'source' && props.sourceConcept && (
        <aside className="source-concept-card">
          <button aria-label="Close concept" onClick={() => props.setSourceConcept(null)}>
            ×
          </button>
          <strong>{props.sourceConcept.title}</strong>
          <span>{props.sourceConcept.text}</span>
        </aside>
      )}
    </div>
  );
}

function ActiveWorkspaceView(props: AppWorkspaceProps) {
  if (props.activeView === 'source') return <SourceEditor {...props} />;
  if (props.activeView === 'waveform') {
    return (
      <WaveformPanel
        data={props.waveform}
        name={props.waveformName}
        runs={props.simulationRuns}
        probeSignal={props.waveformProbe}
        onSignalNavigate={props.onNavigateWaveSignal}
        onLoadRun={props.onLoadWaveformRun}
        theme={props.theme}
        displayOptions={props.accessibility}
        breakpoints={props.breakpoints}
        onBreakpointsChange={props.setBreakpoints}
        breakpointSupported={props.settings.simulator === 'iverilog'}
        initialSession={props.waveformSession}
        onSessionChange={props.setWaveformSession}
      />
    );
  }
  return (
    <SchematicPanel
      netlist={props.netlist}
      top={props.rtlTop}
      focusModule={props.schematicModuleFocus}
      probeNet={props.schematicProbe}
      onNetProbe={(netName) => {
        props.setWaveformProbe(netName);
        if (props.waveform) props.setActiveView('waveform');
        else
          props.setStatus(`Net ${netName} selected; run simulation to cross-probe its waveform.`);
      }}
      onNavigateSource={props.onNavigateYosysSource}
      onGenerateTestbench={props.setStimulusModule}
    />
  );
}

function SourceEditor(props: AppWorkspaceProps) {
  if (!props.openFile) {
    return (
      <div className="editor-empty">
        <div className="chip">HDL</div>
        <h1>Open a Verilog or SystemVerilog file</h1>
        <p>Select a source file from the project tree.</p>
      </div>
    );
  }
  return (
    <Editor
      beforeMount={configureSystemVerilog}
      onMount={props.onEditorMount}
      language="systemverilog"
      theme={props.theme === 'dark' ? 'vs-dark' : 'light'}
      path={props.openFile.path}
      value={props.openFile.content}
      onChange={(content) => props.updateOpenFile((file) => ({ ...file, content: content ?? '' }))}
      options={{
        minimap: { enabled: true },
        fontSize: props.accessibility.largeText ? 17 : 14,
        fontFamily: "'Cascadia Code', Consolas, monospace",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        tabSize: 4,
      }}
    />
  );
}

function ConsoleSplitter(props: AppWorkspaceProps) {
  return (
    <div
      className={`splitter ${props.consoleDock === 'bottom' ? 'horizontal' : 'vertical'}`}
      style={{ gridArea: 'consoleSplitter' }}
      onPointerDown={(event) => {
        props.resizeRef.current =
          props.consoleDock === 'bottom'
            ? {
                kind: 'consoleHeight',
                start: event.clientY,
                size: props.consoleHeight,
                direction: -1,
              }
            : {
                kind: 'consoleWidth',
                start: event.clientX,
                size: props.consoleWidth,
                direction: -1,
              };
        document.body.classList.add('resizing');
      }}
    />
  );
}
