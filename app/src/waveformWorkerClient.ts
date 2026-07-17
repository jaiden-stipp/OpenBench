export type WaveformWorkerPort = Pick<Worker, 'postMessage'>;

export function postWaveformRequest(
  worker: WaveformWorkerPort | null,
  request: Record<string, unknown>,
  projectGeneration: number,
) {
  if (!worker) throw new Error('The waveform parser is not ready. Try the action again.');
  worker.postMessage({ ...request, projectGeneration });
}

export function isCurrentWaveformResponse(
  response: { projectGeneration?: number },
  projectGeneration: number,
) {
  return response.projectGeneration === projectGeneration;
}
