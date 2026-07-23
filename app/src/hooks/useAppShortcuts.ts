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
  const {
    activeView,
    beginNewProject,
    busy,
    openProject,
    projectReady,
    runCompile,
    runRtl,
    runSimulation,
    setPrompt,
  } = options;
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) =>
      handleShortcut(event, {
        activeView,
        beginNewProject,
        busy,
        openProject,
        projectReady,
        runCompile,
        runRtl,
        runSimulation,
        setPrompt,
      });
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [
    activeView,
    beginNewProject,
    busy,
    openProject,
    projectReady,
    runCompile,
    runRtl,
    runSimulation,
    setPrompt,
  ]);
}

function handleShortcut(event: KeyboardEvent, options: ShortcutOptions) {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const ready = options.projectReady && !options.busy;
  const shortcuts = [
    [modifier && event.shiftKey && key === 'n', () => void options.beginNewProject()],
    [modifier && key === 'o', () => void options.openProject()],
    [
      modifier && !event.shiftKey && key === 'n',
      () =>
        options.projectReady &&
        options.setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' }),
    ],
    [modifier && event.shiftKey && key === 'b', () => ready && void options.runCompile()],
    [modifier && event.shiftKey && key === 'r', () => ready && void options.runRtl()],
    [event.key === 'F5', () => ready && void options.runSimulation()],
    [
      options.activeView === 'waveform' && modifier && (event.key === '+' || event.key === '='),
      () => window.dispatchEvent(new CustomEvent('rtldeck:wave-zoom', { detail: 0.5 })),
    ],
    [
      options.activeView === 'waveform' && modifier && event.key === '-',
      () => window.dispatchEvent(new CustomEvent('rtldeck:wave-zoom', { detail: 2 })),
    ],
  ] as const;
  const match = shortcuts.find(([matches]) => matches);
  if (!match) return;
  event.preventDefault();
  match[1]();
}
