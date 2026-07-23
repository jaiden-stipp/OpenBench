import type { Dispatch, SetStateAction } from 'react';
import AppMenu from '../AppMenu';
import RunToolbar from './RunToolbar';
import ThemeLogo from './ThemeLogo';
import type { ActiveView, OpenFile, Theme } from '../types/ui';

type AppHeaderProps = {
  activeView: ActiveView;
  compiling: boolean;
  consoleDock: 'bottom' | 'right';
  designTop: string;
  explorerDock: 'left' | 'right';
  hasRunSimulation: boolean;
  menuActions: Record<string, () => void>;
  netlistReady: boolean;
  openFile: OpenFile | null;
  projectReady: boolean;
  rtlRunning: boolean;
  setConsoleDock: Dispatch<SetStateAction<'bottom' | 'right'>>;
  setExplorerDock: Dispatch<SetStateAction<'left' | 'right'>>;
  setShowGuidance: Dispatch<SetStateAction<boolean>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setTheme: Dispatch<SetStateAction<Theme>>;
  setWatchMode: Dispatch<SetStateAction<boolean>>;
  simulating: boolean;
  simulationTop: string;
  theme: Theme;
  waveformReady: boolean;
  watchMode: boolean;
  onCompile: () => void;
  onRtl: () => void;
  onSave: () => void;
  onSimulate: () => void;
};

export default function AppHeader(props: AppHeaderProps) {
  const toggleTheme = () => props.setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <ThemeLogo />
        </span>
        <span>RTLDeck</span>
        <small>PREVIEW</small>
      </div>
      <AppMenu
        hasProject={props.projectReady}
        hasFile={Boolean(props.openFile)}
        hasWaveform={props.waveformReady}
        hasSchematic={props.netlistReady}
        activeView={props.activeView}
        watchMode={props.watchMode}
        theme={props.theme}
        explorerDock={props.explorerDock}
        consoleDock={props.consoleDock}
        actions={props.menuActions}
      />
      <RunToolbar
        designTop={props.designTop}
        hasProject={props.projectReady}
        hasOpenFile={Boolean(props.openFile)}
        fileIsSaved={!props.openFile || props.openFile.content === props.openFile.savedContent}
        compiling={props.compiling}
        simulating={props.simulating}
        simulationTop={props.simulationTop}
        rtlRunning={props.rtlRunning}
        watchMode={props.watchMode}
        hasRunSimulation={props.hasRunSimulation}
        explorerDock={props.explorerDock}
        consoleDock={props.consoleDock}
        onSave={props.onSave}
        onCompile={props.onCompile}
        onSimulate={props.onSimulate}
        onRtl={props.onRtl}
        onToggleWatch={() => props.setWatchMode((current) => !current)}
        onOpenHealth={() => props.setShowGuidance(true)}
        onOpenSettings={() => props.setShowSettings(true)}
        onOpenHelp={() => props.setShowHelp(true)}
        onToggleTheme={toggleTheme}
        onExplorerDock={props.setExplorerDock}
        onConsoleDock={props.setConsoleDock}
      />
    </header>
  );
}
