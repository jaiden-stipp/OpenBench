import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { sourceForNet, type YosysNetlist } from '../netlistGraph';
import { parseYosysSource } from '../sourceLocation';
import type { VcdSignal } from '../vcdParser';
import type { ActiveView, OpenFile } from '../types/ui';

type RunActionOptions = {
  breakpoints: WaveBreakpoint[];
  openFiles: OpenFile[];
  pendingBreakpointHitRef: MutableRefObject<{ condition: string; time: number } | null>;
  pendingRunSourcesRef: MutableRefObject<Record<string, string>>;
  projectSources: Array<{ path: string; content: string }>;
  saveAllDirtyFiles: () => Promise<void>;
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
  const {
    breakpoints,
    openFiles,
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    projectSources,
    saveAllDirtyFiles,
    setActiveView,
    setCompiling,
    setConsoleText,
    setHasRunSimulation,
    setNetlist,
    setRtlRunning,
    setRtlTop,
    setShowGuidance,
    setSimulating,
    setStatus,
    waveformWorkerRef,
  } = options;
  const reportError = useCallback(
    (error: unknown) => reportRunError(error, setConsoleText, setStatus),
    [setConsoleText, setStatus],
  );
  const runCompile = useCallback(async () => {
    try {
      await saveAllDirtyFiles();
      await window.openbench.runCompile();
    } catch (error) {
      setCompiling(false);
      reportError(error);
    }
  }, [reportError, saveAllDirtyFiles, setCompiling]);
  const runSimulation = useCallback(async () => {
    try {
      await saveAllDirtyFiles();
      pendingRunSourcesRef.current = Object.fromEntries([
        ...projectSources.map((file) => [file.path, file.content] as const),
        ...openFiles.map((file) => [file.path, file.content] as const),
      ]);
      const result = await window.openbench.runSimulation(breakpoints);
      pendingBreakpointHitRef.current = result.breakpointHit || null;
      setHasRunSimulation(true);
      setStatus('Parsing VCD off the UI thread');
      waveformWorkerRef.current?.postMessage(await window.openbench.readLatestVcd());
    } catch (error) {
      setSimulating(false);
      setShowGuidance(true);
      reportError(error);
    }
  }, [
    breakpoints,
    openFiles,
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    projectSources,
    reportError,
    saveAllDirtyFiles,
    setHasRunSimulation,
    setShowGuidance,
    setSimulating,
    setStatus,
    waveformWorkerRef,
  ]);
  const runRtl = useCallback(async () => {
    try {
      await saveAllDirtyFiles();
      await window.openbench.runRtl();
      const result = await window.openbench.readLatestNetlist();
      setNetlist(result.netlist);
      setRtlTop(result.top);
      setActiveView('schematic');
      setStatus(`ELK layout for ${result.top}`);
    } catch (error) {
      setRtlRunning(false);
      reportError(error);
    }
  }, [
    reportError,
    saveAllDirtyFiles,
    setActiveView,
    setNetlist,
    setRtlRunning,
    setRtlTop,
    setStatus,
  ]);
  return { runCompile, runRtl, runSimulation };
}

function reportRunError(
  error: unknown,
  setConsoleText: Dispatch<SetStateAction<string>>,
  setStatus: Dispatch<SetStateAction<string>>,
) {
  const message = error instanceof Error ? error.message : String(error);
  setConsoleText((value) => `${value}\n${message}\n`);
  setStatus(message);
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
  const { netlist, openPath, project, setSchematicProbe, setStatus } = options;
  const navigateYosysSource = useCallback(
    (source: string) => {
      if (!project) return;
      const location = parseYosysSource(source, project.root);
      if (location) void openPath(location.path, location.line, location.column);
      else setStatus(`No source location for ${source}`);
    },
    [openPath, project, setStatus],
  );
  const navigateWaveSignal = useCallback(
    (signal: VcdSignal) => {
      const cleanName = signal.name.replace(/\s*\[[^\]]+\]\s*$/, '');
      setSchematicProbe(cleanName);
      const source = netlist ? sourceForNet(netlist, signal.path) : null;
      if (source) navigateYosysSource(source);
      else setStatus(`No Yosys declaration found for ${signal.path}. Run RTL Analysis first.`);
    },
    [navigateYosysSource, netlist, setSchematicProbe, setStatus],
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
