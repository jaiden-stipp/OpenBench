import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { clearInlineLintMarkers } from './useFilePersistence';
import type { ConsoleMode } from '../types/ui';

type BackendEventSetters = {
  setCompiling: Dispatch<SetStateAction<boolean>>;
  setCompilePassed: Dispatch<SetStateAction<boolean>>;
  setConsoleMode: Dispatch<SetStateAction<ConsoleMode>>;
  setConsoleText: Dispatch<SetStateAction<string>>;
  setRtlRunning: Dispatch<SetStateAction<boolean>>;
  setLintStatus: Dispatch<SetStateAction<'idle' | 'checking' | 'clean' | 'issues'>>;
  setShowGuidance: Dispatch<SetStateAction<boolean>>;
  setSimulating: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useBackendEvents(setters: BackendEventSetters) {
  useCompileEvents(setters);
  useSimulationEvents(setters);
  useRtlEvents(setters);
}

function useCompileEvents(setters: BackendEventSetters) {
  const {
    setCompiling,
    setCompilePassed,
    setConsoleMode,
    setConsoleText,
    setLintStatus,
    setShowGuidance,
    setStatus,
  } = setters;
  useEffect(
    () =>
      window.openbench.onCompileEvent((event) => {
        if (event.type === 'start') {
          setCompiling(true);
          setConsoleMode('compile');
          setConsoleText(
            `Checking ${event.fileCount ?? 'project'} source files with ${event.backend === 'verilator' ? 'Verilator' : 'Icarus Verilog'}.\n$ ${event.command}\n`,
          );
          setStatus('Compiling');
        } else if (event.type === 'output') {
          setConsoleText((value) => value + event.text);
        } else {
          setCompiling(false);
          setCompilePassed(event.code === 0);
          if (event.code === 0) clearInlineLintMarkers();
          setLintStatus(event.code === 0 ? 'clean' : 'issues');
          if (event.code !== 0) setShowGuidance(true);
          setConsoleText((value) => `${value}\nCompile finished with exit code ${event.code}.\n`);
          setStatus(event.code === 0 ? 'Compile passed' : 'Compile failed');
        }
      }),
    [
      setCompiling,
      setCompilePassed,
      setConsoleMode,
      setConsoleText,
      setLintStatus,
      setShowGuidance,
      setStatus,
    ],
  );
}

function useSimulationEvents(setters: BackendEventSetters) {
  const { setConsoleMode, setConsoleText, setShowGuidance, setSimulating, setStatus } = setters;
  useEffect(
    () =>
      window.openbench.onSimulationEvent((event) => {
        if (event.type === 'start') {
          setSimulating(true);
          setConsoleMode('simulation');
          setConsoleText(
            `Starting real ${event.backend === 'verilator' ? 'Verilator' : 'Icarus'} simulation…\n`,
          );
          setStatus('Simulating');
        } else if (event.type === 'output') {
          setConsoleText((value) => value + event.text);
        } else {
          setSimulating(false);
          if (event.code !== 0) setShowGuidance(true);
          setConsoleText(
            (value) => `${value}\nSimulation finished with exit code ${event.code}.\n`,
          );
          setStatus(
            event.code === 0
              ? event.breakpointHit
                ? `Stopped at ${event.breakpointHit.condition} (time ${event.breakpointHit.time})`
                : `Simulation passed: ${event.vcdPath}`
              : 'Simulation failed',
          );
        }
      }),
    [setConsoleMode, setConsoleText, setShowGuidance, setSimulating, setStatus],
  );
}

function useRtlEvents(setters: BackendEventSetters) {
  const { setConsoleMode, setConsoleText, setRtlRunning, setStatus } = setters;
  useEffect(
    () =>
      window.openbench.onRtlEvent((event) => {
        if (event.type === 'start') {
          setRtlRunning(true);
          setConsoleMode('rtl');
          setConsoleText('Starting real Yosys elaboration…\n');
          setStatus('Elaborating RTL');
        } else if (event.type === 'output') {
          setConsoleText((value) => value + event.text);
        } else {
          setRtlRunning(false);
          setConsoleText((value) => `${value}\nYosys finished with exit code ${event.code}.\n`);
          setStatus(
            event.code === 0
              ? `RTL ready: ${event.top} (${event.moduleCount} modules)`
              : 'RTL elaboration failed',
          );
        }
      }),
    [setConsoleMode, setConsoleText, setRtlRunning, setStatus],
  );
}
