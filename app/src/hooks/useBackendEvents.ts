import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ConsoleMode } from '../types/ui';

type BackendEventSetters = {
  setCompiling: Dispatch<SetStateAction<boolean>>;
  setCompilePassed: Dispatch<SetStateAction<boolean>>;
  setConsoleMode: Dispatch<SetStateAction<ConsoleMode>>;
  setConsoleText: Dispatch<SetStateAction<string>>;
  setRtlRunning: Dispatch<SetStateAction<boolean>>;
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
  useEffect(
    () =>
      window.openbench.onCompileEvent((event) => {
        if (event.type === 'start') {
          setters.setCompiling(true);
          setters.setConsoleMode('compile');
          setters.setConsoleText(`$ ${event.command}\n`);
          setters.setStatus('Compiling');
        } else if (event.type === 'output') {
          setters.setConsoleText((value) => value + event.text);
        } else {
          setters.setCompiling(false);
          setters.setCompilePassed(event.code === 0);
          if (event.code !== 0) setters.setShowGuidance(true);
          setters.setConsoleText(
            (value) => `${value}\nCompile finished with exit code ${event.code}.\n`,
          );
          setters.setStatus(event.code === 0 ? 'Compile passed' : 'Compile failed');
        }
      }),
    [],
  );
}

function useSimulationEvents(setters: BackendEventSetters) {
  useEffect(
    () =>
      window.openbench.onSimulationEvent((event) => {
        if (event.type === 'start') {
          setters.setSimulating(true);
          setters.setConsoleMode('simulation');
          setters.setConsoleText(
            `Starting real ${event.backend === 'verilator' ? 'Verilator' : 'Icarus'} simulation…\n`,
          );
          setters.setStatus('Simulating');
        } else if (event.type === 'output') {
          setters.setConsoleText((value) => value + event.text);
        } else {
          setters.setSimulating(false);
          if (event.code !== 0) setters.setShowGuidance(true);
          setters.setConsoleText(
            (value) => `${value}\nSimulation finished with exit code ${event.code}.\n`,
          );
          setters.setStatus(
            event.code === 0
              ? event.breakpointHit
                ? `Stopped at ${event.breakpointHit.condition} (time ${event.breakpointHit.time})`
                : `Simulation passed: ${event.vcdPath}`
              : 'Simulation failed',
          );
        }
      }),
    [],
  );
}

function useRtlEvents(setters: BackendEventSetters) {
  useEffect(
    () =>
      window.openbench.onRtlEvent((event) => {
        if (event.type === 'start') {
          setters.setRtlRunning(true);
          setters.setConsoleMode('rtl');
          setters.setConsoleText('Starting real Yosys elaboration…\n');
          setters.setStatus('Elaborating RTL');
        } else if (event.type === 'output') {
          setters.setConsoleText((value) => value + event.text);
        } else {
          setters.setRtlRunning(false);
          setters.setConsoleText(
            (value) => `${value}\nYosys finished with exit code ${event.code}.\n`,
          );
          setters.setStatus(
            event.code === 0
              ? `RTL ready: ${event.top} (${event.moduleCount} modules)`
              : 'RTL elaboration failed',
          );
        }
      }),
    [],
  );
}
