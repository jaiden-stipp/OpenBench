import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { sourceForNet, type YosysNetlist } from '../netlistGraph';
import { parseYosysSource } from '../sourceLocation';
import type { VcdSignal } from '../vcdParser';
import type { ActiveView, OpenFile } from '../types/ui';

type RunActionOptions = {
  breakpoints: WaveBreakpoint[];
  openFile: OpenFile | null;
  openFiles: OpenFile[];
  pendingBreakpointHitRef: MutableRefObject<{ condition: string; time: number } | null>;
  pendingRunSourcesRef: MutableRefObject<Record<string, string>>;
  projectSources: Array<{ path: string; content: string }>;
  save: (triggerWatch?: boolean) => Promise<void>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setCompiling: Dispatch<SetStateAction<boolean>>;
  setConsoleText: Dispatch<SetStateAction<string>>;
  setHasRunSimulation: Dispatch<SetStateAction<boolean>>;
  setNetlist: Dispatch<SetStateAction<YosysNetlist | null>>;
  setRtlRunning: Dispatch<SetStateAction<boolean>>;
  setRtlTop: Dispatch<SetStateAction<string | null>>;
  setShowGuidance: Dispatch<SetStateAction<boolean>>;
  setSimulating: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  waveformWorkerRef: MutableRefObject<Worker | null>;
};

export function useRunActions(options: RunActionOptions) {
  const runCompile = async () => {
    try {
      await window.openbench.runCompile();
    } catch (error) {
      options.setCompiling(false);
      reportRunError(error, options);
    }
  };
  const runSimulation = async () => {
    try {
      if (isDirty(options.openFile)) await options.save(false);
      options.pendingRunSourcesRef.current = Object.fromEntries([
        ...options.projectSources.map((file) => [file.path, file.content] as const),
        ...options.openFiles.map((file) => [file.path, file.content] as const),
      ]);
      const result = await window.openbench.runSimulation(options.breakpoints);
      options.pendingBreakpointHitRef.current = result.breakpointHit || null;
      options.setHasRunSimulation(true);
      options.setStatus('Parsing VCD off the UI thread');
      options.waveformWorkerRef.current?.postMessage(await window.openbench.readLatestVcd());
    } catch (error) {
      options.setSimulating(false);
      options.setShowGuidance(true);
      reportRunError(error, options);
    }
  };
  const runRtl = async () => {
    try {
      if (isDirty(options.openFile)) await options.save(false);
      await window.openbench.runRtl();
      const result = await window.openbench.readLatestNetlist();
      options.setNetlist(result.netlist);
      options.setRtlTop(result.top);
      options.setActiveView('schematic');
      options.setStatus(`ELK layout for ${result.top}`);
    } catch (error) {
      options.setRtlRunning(false);
      reportRunError(error, options);
    }
  };
  return { runCompile, runRtl, runSimulation };
}

function isDirty(file: OpenFile | null) {
  return Boolean(file && file.content !== file.savedContent);
}

function reportRunError(error: unknown, options: RunActionOptions) {
  const message = error instanceof Error ? error.message : String(error);
  options.setConsoleText((value) => `${value}\n${message}\n`);
  options.setStatus(message);
}

type CrossProbeOptions = {
  netlist: YosysNetlist | null;
  openPath: (path: string, line?: number, column?: number) => Promise<void>;
  project: ProjectData | null;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setConsoleText: Dispatch<SetStateAction<string>>;
  setProject: Dispatch<SetStateAction<ProjectData | null>>;
  setSchematicProbe: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useCrossProbeActions(options: CrossProbeOptions) {
  const navigateYosysSource = useCallback(
    (source: string) => {
      if (!options.project) return;
      const location = parseYosysSource(source, options.project.root);
      if (location) void options.openPath(location.path, location.line, location.column);
      else options.setStatus(`No source location for ${source}`);
    },
    [options.openPath, options.project],
  );
  const navigateWaveSignal = useCallback(
    (signal: VcdSignal) => {
      const cleanName = signal.name.replace(/\s*\[[^\]]+\]\s*$/, '');
      options.setSchematicProbe(cleanName);
      const source = options.netlist ? sourceForNet(options.netlist, signal.path) : null;
      if (source) navigateYosysSource(source);
      else
        options.setStatus(`No Yosys declaration found for ${signal.path}. Run RTL Analysis first.`);
    },
    [navigateYosysSource, options.netlist],
  );
  const generateTestbench = async (moduleName: string, stimulus?: StimulusOptions) => {
    try {
      const generated = await window.openbench.generateTestbench(moduleName, stimulus);
      options.setProject(await window.openbench.refreshProject());
      await options.openPath(generated.path);
      const found = [
        ...generated.detected.clocks.map((name) => `clock ${name}`),
        ...generated.detected.resets.map((name) => `reset ${name}`),
      ].join(', ');
      options.setStatus(`Created ${generated.path}${found ? `; detected ${found}` : ''}`);
      options.setConsoleText(
        (value) =>
          `${value}\nCreated editable starter testbench ${generated.path} from real Yosys port metadata.\n`,
      );
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  return { generateTestbench, navigateWaveSignal, navigateYosysSource };
}

type StimulusOptions = {
  clockPeriod: number;
  resetDuration: number;
  finishTime: number;
  steps: Array<{ time: number; signal: string; value: string }>;
};
