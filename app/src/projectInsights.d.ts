import type { VcdData } from './vcdParser.js';
export type ProjectInsight = {
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
};
export type ProjectAnalysis = {
  modules: Array<{ name: string; file: string }>;
  testbenches: Array<{ name: string; file: string }>;
  topCandidates: Array<{ name: string; file: string }>;
  missingModules: string[];
  duplicates: Array<{ name: string; files: string[] }>;
  issues: ProjectInsight[];
  suggestedTop: string;
  suggestedSimulationTop: string;
};
export function analyzeProjectSources(
  files: Array<{ path: string; content: string }>,
  settings?: Partial<ProjectSettings>,
): ProjectAnalysis;
export function explainWaveform(data: VcdData | null): ProjectInsight[];
