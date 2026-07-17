import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentWaveformResponse, postWaveformRequest } from '../src/waveformWorkerClient.ts';

test('waveform requests require an initialized worker', () => {
  assert.throws(
    () => postWaveformRequest(null, { id: 'history-1' }, 3),
    /waveform parser is not ready/i,
  );
});

test('waveform requests and responses carry a project generation', () => {
  const messages = [];
  postWaveformRequest({ postMessage: (message) => messages.push(message) }, { id: 'same-id' }, 7);
  assert.equal(messages[0].projectGeneration, 7);
  assert.equal(isCurrentWaveformResponse({ projectGeneration: 6 }, 7), false);
  assert.equal(isCurrentWaveformResponse({ projectGeneration: 7 }, 7), true);
});
