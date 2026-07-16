import type { VcdData } from '../vcdParser.js';

export type ActiveView = 'source' | 'waveform' | 'schematic';
export type ConsoleMode = 'compile' | 'simulation' | 'rtl';
export type DockSide = 'left' | 'right';
export type ConsoleDock = 'bottom' | 'right';
export type Theme = 'dark' | 'light';

export interface OpenFile {
  path: string;
  content: string;
  savedContent: string;
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
}

export interface SimulationRun {
  id: string;
  name: string;
  createdAt: number;
  data?: VcdData;
  files: Record<string, string>;
  fileName?: string;
  size?: number;
  loading?: boolean;
}

export interface PromptState {
  kind: 'new-file' | 'new-folder' | 'rename';
  node?: ProjectNode;
  initialValue: string;
}

export interface ContextMenuState {
  node: ProjectNode;
  x: number;
  y: number;
}

export interface SourceConcept {
  title: string;
  text: string;
}
