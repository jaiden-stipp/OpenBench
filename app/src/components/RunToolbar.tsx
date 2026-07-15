interface RunToolbarProps {
  hasProject: boolean;
  hasOpenFile: boolean;
  fileIsSaved: boolean;
  compiling: boolean;
  simulating: boolean;
  rtlRunning: boolean;
  watchMode: boolean;
  hasRunSimulation: boolean;
  explorerDock: 'left' | 'right';
  consoleDock: 'bottom' | 'right';
  onSave: () => void;
  onCompile: () => void;
  onSimulate: () => void;
  onRtl: () => void;
  onToggleWatch: () => void;
  onOpenHealth: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onToggleTheme: () => void;
  onExplorerDock: (dock: 'left' | 'right') => void;
  onConsoleDock: (dock: 'bottom' | 'right') => void;
}

export default function RunToolbar(props: RunToolbarProps) {
  const backendBusy = props.compiling || props.simulating || props.rtlRunning;

  return (
    <div className="toolbar run-toolbar">
      <button
        className="visually-hidden"
        data-testid="save-file"
        disabled={!props.hasOpenFile || props.fileIsSaved}
        onClick={props.onSave}
      >
        Save
      </button>
      <button
        className="primary"
        data-testid="run-compile"
        title="Ctrl+Shift+B"
        disabled={!props.hasProject || backendBusy}
        onClick={props.onCompile}
      >
        {props.compiling ? 'Compiling…' : 'Run Compile'}
      </button>
      <button
        data-testid="run-simulation"
        title="F5"
        disabled={!props.hasProject || backendBusy}
        onClick={props.onSimulate}
      >
        {props.simulating ? 'Simulating…' : 'Run Simulation'}
      </button>
      <button
        data-testid="run-rtl"
        title="Ctrl+Shift+R"
        disabled={!props.hasProject || backendBusy}
        onClick={props.onRtl}
      >
        {props.rtlRunning ? 'Elaborating…' : 'RTL Analysis'}
      </button>
      <button
        className={props.watchMode ? 'watch-active' : ''}
        data-testid="watch-toggle"
        title={
          props.hasRunSimulation
            ? 'Automatically recompile, rerun, and refresh the waveform after a source save'
            : 'Run one simulation before enabling automatic reruns'
        }
        disabled={!props.hasProject}
        onClick={props.onToggleWatch}
      >
        Watch {props.watchMode ? 'On' : 'Off'}
      </button>
      <button
        className="icon-action"
        data-testid="open-health"
        title="Project health and learning"
        aria-label="Project health and learning"
        disabled={!props.hasProject}
        onClick={props.onOpenHealth}
      >
        ♡
      </button>
      <button
        className="icon-action"
        data-testid="open-settings"
        title="Project settings"
        aria-label="Project settings"
        disabled={!props.hasProject}
        onClick={props.onOpenSettings}
      >
        ⚙
      </button>
      <button
        className="icon-action"
        data-testid="open-help"
        title="Beginner guide"
        aria-label="Beginner guide"
        onClick={props.onOpenHelp}
      >
        ?
      </button>
      <button className="visually-hidden" data-testid="theme-toggle" onClick={props.onToggleTheme}>
        Theme
      </button>
      <select
        className="visually-hidden"
        aria-label="Explorer dock"
        value={props.explorerDock}
        onChange={(event) => props.onExplorerDock(event.target.value as 'left' | 'right')}
      >
        <option value="left">Explorer: Left</option>
        <option value="right">Explorer: Right</option>
      </select>
      <select
        className="visually-hidden"
        aria-label="Console dock"
        value={props.consoleDock}
        onChange={(event) => props.onConsoleDock(event.target.value as 'bottom' | 'right')}
      >
        <option value="bottom">Console: Bottom</option>
        <option value="right">Console: Right</option>
      </select>
    </div>
  );
}
