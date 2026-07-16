import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ActiveView, PromptState } from '../types/ui';

type ShortcutOptions = {
  activeView: ActiveView;
  beginNewProject: () => Promise<void>;
  busy: boolean;
  openProject: () => Promise<void>;
  projectReady: boolean;
  runCompile: () => Promise<void>;
  runRtl: () => Promise<void>;
  runSimulation: () => Promise<void>;
  setPrompt: Dispatch<SetStateAction<PromptState | null>>;
};

export function useAppShortcuts(options: ShortcutOptions) {
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => handleShortcut(event, options);
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [
    options.activeView,
    options.beginNewProject,
    options.busy,
    options.openProject,
    options.projectReady,
    options.runCompile,
    options.runRtl,
    options.runSimulation,
  ]);
}

function handleShortcut(event: KeyboardEvent, options: ShortcutOptions) {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    void options.beginNewProject();
  } else if (modifier && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    void options.openProject();
  } else if (modifier && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    if (options.projectReady)
      options.setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' });
  } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    if (options.projectReady && !options.busy) void options.runCompile();
  } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    if (options.projectReady && !options.busy) void options.runRtl();
  } else if (event.key === 'F5') {
    event.preventDefault();
    if (options.projectReady && !options.busy) void options.runSimulation();
  } else if (
    options.activeView === 'waveform' &&
    modifier &&
    (event.key === '+' || event.key === '=')
  ) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 0.5 }));
  } else if (options.activeView === 'waveform' && modifier && event.key === '-') {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 2 }));
  }
}
