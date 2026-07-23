import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { writePreference } from '../compatibility';
import type { AccessibilityPreferences, Theme } from '../types/ui';

export type ResizeState = {
  kind: 'explorer' | 'consoleHeight' | 'consoleWidth';
  start: number;
  size: number;
  direction: 1 | -1;
};

type LayoutPreferences = {
  accessibility: AccessibilityPreferences;
  consoleDock: 'bottom' | 'right';
  explorerDock: 'left' | 'right';
  resizeRef: MutableRefObject<ResizeState | null>;
  setConsoleHeight: Dispatch<SetStateAction<number>>;
  setConsoleWidth: Dispatch<SetStateAction<number>>;
  setExplorerWidth: Dispatch<SetStateAction<number>>;
  theme: Theme;
};

export function useLayoutPreferences(options: LayoutPreferences) {
  useAccessibilityPreferences(options.accessibility);
  useStoredLayout(options.theme, options.explorerDock, options.consoleDock);
  useResizablePanels(options);
}

function useAccessibilityPreferences(accessibility: AccessibilityPreferences) {
  useEffect(() => {
    writePreference('accessibility', JSON.stringify(accessibility));
    document.body.classList.toggle('high-contrast', accessibility.highContrast);
    document.body.classList.toggle('large-interface-text', accessibility.largeText);
    document.body.classList.toggle('reduce-motion', accessibility.reduceMotion);
  }, [accessibility]);
}

function useStoredLayout(theme: Theme, explorerDock: 'left' | 'right', consoleDock: string) {
  useEffect(() => writePreference('theme', theme), [theme]);
  useEffect(() => writePreference('explorerDock', explorerDock), [explorerDock]);
  useEffect(() => writePreference('consoleDock', consoleDock), [consoleDock]);
}

function useResizablePanels(options: LayoutPreferences) {
  const { resizeRef, setConsoleHeight, setConsoleWidth, setExplorerWidth } = options;
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const coordinate = resize.kind === 'consoleHeight' ? event.clientY : event.clientX;
      const next = resize.size + (coordinate - resize.start) * resize.direction;
      if (resize.kind === 'explorer') setExplorerWidth(Math.max(170, Math.min(480, next)));
      else if (resize.kind === 'consoleHeight')
        setConsoleHeight(Math.max(120, Math.min(480, next)));
      else setConsoleWidth(Math.max(240, Math.min(620, next)));
    };
    const stop = () => {
      resizeRef.current = null;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [resizeRef, setConsoleHeight, setConsoleWidth, setExplorerWidth]);
}
