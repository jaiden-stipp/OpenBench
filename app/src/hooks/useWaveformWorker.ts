import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { VcdData } from '../vcdParser';
import type { ActiveView, SimulationRun } from '../types/ui';

type WorkerMessage = {
  ok: boolean;
  name?: string;
  data?: VcdData;
  error?: string;
  purpose?: 'history' | 'open';
  id?: string;
  createdAt?: number;
};

type WaveformWorkerOptions = {
  pendingBreakpointHitRef: MutableRefObject<{ condition: string; time: number } | null>;
  pendingRunSourcesRef: MutableRefObject<Record<string, string>>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setSimulationRuns: Dispatch<SetStateAction<SimulationRun[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setWaveform: Dispatch<SetStateAction<VcdData | null>>;
  setWaveformName: Dispatch<SetStateAction<string | null>>;
  waveformWorkerRef: MutableRefObject<Worker | null>;
};

export function useWaveformWorker(options: WaveformWorkerOptions) {
  const {
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    setActiveView,
    setSimulationRuns,
    setStatus,
    setWaveform,
    setWaveformName,
    waveformWorkerRef,
  } = options;
  useEffect(() => {
    const worker = new Worker(new URL('../vcd.worker.ts', import.meta.url), { type: 'module' });
    waveformWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) =>
      handleWorkerMessage(event.data, {
        pendingBreakpointHitRef,
        pendingRunSourcesRef,
        setActiveView,
        setSimulationRuns,
        setStatus,
        setWaveform,
        setWaveformName,
        waveformWorkerRef,
      });
    return () => {
      worker.terminate();
      if (waveformWorkerRef.current === worker) waveformWorkerRef.current = null;
    };
  }, [
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    setActiveView,
    setSimulationRuns,
    setStatus,
    setWaveform,
    setWaveformName,
    waveformWorkerRef,
  ]);
}

function handleWorkerMessage(message: WorkerMessage, options: WaveformWorkerOptions) {
  if (!message.ok || !message.data) {
    if (message.id)
      options.setSimulationRuns((current) =>
        current.map((run) => (run.id === message.id ? { ...run, loading: false } : run)),
      );
    options.setStatus(message.error || 'Unable to parse VCD.');
    return;
  }
  if (message.purpose === 'history') {
    appendSavedRun(message, options.setSimulationRuns);
    return;
  }
  if (message.purpose === 'open') {
    options.setWaveform(message.data);
    options.setWaveformName(message.name ?? 'simulation.vcd');
    appendSavedRun(message, options.setSimulationRuns);
    options.setActiveView('waveform');
    options.setStatus(`Restored ${message.data.signals.length} waveform signals`);
    return;
  }

  options.setWaveform(message.data);
  options.setWaveformName(message.name ?? 'simulation.vcd');
  appendCurrentRun(message.data, options);
  options.setActiveView('waveform');
  const hit = options.pendingBreakpointHitRef.current;
  options.pendingBreakpointHitRef.current = null;
  options.setStatus(
    hit
      ? `Stopped at ${hit.condition} (time ${hit.time})`
      : `Loaded ${message.data.signals.length} waveform signals`,
  );
}

function appendSavedRun(
  message: WorkerMessage & { data?: VcdData },
  setRuns: Dispatch<SetStateAction<SimulationRun[]>>,
) {
  setRuns((current) =>
    current.map((run) => {
      if (run.id === message.id) return { ...run, data: message.data!, loading: false };
      return run.fileName && run.data ? { ...run, data: undefined } : run;
    }),
  );
}

function appendCurrentRun(data: VcdData, options: WaveformWorkerOptions) {
  options.setSimulationRuns((current) => {
    const files = options.pendingRunSourcesRef.current;
    const previous = current.find((run) => !run.fileName)?.files || {};
    const changed = Object.keys(files).filter((file) => previous[file] !== files[file]).length;
    const savedHistory = current.filter((run) => run.fileName).slice(0, 6);
    return [
      {
        id: `${Date.now()}`,
        name: `Run ${current.length + 1}${current.length ? ` · ${changed} file${changed === 1 ? '' : 's'} changed` : ''}`,
        createdAt: Date.now(),
        data,
        files,
      },
      ...savedHistory,
    ];
  });
}
