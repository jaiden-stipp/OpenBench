import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { sourceForNet, type YosysNetlist } from '../netlistGraph';
import { parseYosysSource } from '../sourceLocation';
import type { VcdSignal } from '../vcdParser';
import type { ActiveView, OpenFile } from '../types/ui';
import { postWaveformRequest } from '../waveformWorkerClient';

type RunActionOptions = {
  breakpoints: WaveBreakpoint[];
  openFiles: OpenFile[];
  pendingBreakpointHitRef: MutableRefObject<{ condition: string; time: number } | null>;
  pendingRunSourcesRef: MutableRefObject<Record<string, string>>;
  projectSources: Array<{ path: string; content: string }>;
  projectGenerationRef: MutableRefObject<number>;
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
  return {
    runCompile: useCompileAction(options),
    runRtl: useRtlAction(options),
    runSimulation: useSimulationAction(options),
  };
}

function useCompileAction(options: RunActionOptions) {
  const { projectGenerationRef, saveAllDirtyFiles, setCompiling } = options;
  const reportError = useRunErrorReporter(options);
  return useCallback(async () => {
    const requestGeneration = projectGenerationRef.current;
    try {
      await saveAllDirtyFiles();
      if (requestGeneration !== projectGenerationRef.current) return;
      await window.openbench.runCompile();
    } catch (error) {
      if (requestGeneration !== projectGenerationRef.current) return;
      setCompiling(false);
      reportError(error);
    }
  }, [projectGenerationRef, reportError, saveAllDirtyFiles, setCompiling]);
}

function useSimulationAction(options: RunActionOptions) {
  const {
    breakpoints,
    openFiles,
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    projectSources,
    projectGenerationRef,
    saveAllDirtyFiles,
    setHasRunSimulation,
    setShowGuidance,
    setSimulating,
    setStatus,
    waveformWorkerRef,
  } = options;
  const reportError = useRunErrorReporter(options);
  return useCallback(async () => {
    const requestGeneration = projectGenerationRef.current;
    try {
      await saveAllDirtyFiles();
      if (requestGeneration !== projectGenerationRef.current) return;
      pendingRunSourcesRef.current = Object.fromEntries([
        ...projectSources.map((file) => [file.path, file.content] as const),
        ...openFiles.map((file) => [file.path, file.content] as const),
      ]);
      const result = await window.openbench.runSimulation(breakpoints);
      if (requestGeneration !== projectGenerationRef.current) return;
      pendingBreakpointHitRef.current = result.breakpointHit || null;
      setHasRunSimulation(true);
      setStatus('Parsing VCD off the UI thread');
      const latestVcd = await window.openbench.readLatestVcd();
      if (requestGeneration !== projectGenerationRef.current) return;
      postWaveformRequest(waveformWorkerRef.current, latestVcd, requestGeneration);
    } catch (error) {
      if (requestGeneration !== projectGenerationRef.current) return;
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
    projectGenerationRef,
    reportError,
    saveAllDirtyFiles,
    setHasRunSimulation,
    setShowGuidance,
    setSimulating,
    setStatus,
    waveformWorkerRef,
  ]);
}

function useRtlAction(options: RunActionOptions) {
  const {
    projectGenerationRef,
    saveAllDirtyFiles,
    setActiveView,
    setNetlist,
    setRtlRunning,
    setRtlTop,
    setStatus,
  } = options;
  const reportError = useRunErrorReporter(options);
  return useCallback(async () => {
    const requestGeneration = projectGenerationRef.current;
    try {
      await saveAllDirtyFiles();
      if (requestGeneration !== projectGenerationRef.current) return;
      await window.openbench.runRtl();
      if (requestGeneration !== projectGenerationRef.current) return;
      const result = await window.openbench.readLatestNetlist();
      if (requestGeneration !== projectGenerationRef.current) return;
      setNetlist(result.netlist);
      setRtlTop(result.top);
      setActiveView('schematic');
      setStatus(`ELK layout for ${result.top}`);
    } catch (error) {
      if (requestGeneration !== projectGenerationRef.current) return;
      setRtlRunning(false);
      reportError(error);
    }
  }, [
    reportError,
    projectGenerationRef,
    saveAllDirtyFiles,
    setActiveView,
    setNetlist,
    setRtlRunning,
    setRtlTop,
    setStatus,
  ]);
}

function useRunErrorReporter({ setConsoleText, setStatus }: RunActionOptions) {
  return useCallback(
    (error: unknown) => reportRunError(error, setConsoleText, setStatus),
    [setConsoleText, setStatus],
  );
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
