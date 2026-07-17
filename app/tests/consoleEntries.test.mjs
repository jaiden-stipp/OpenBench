import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleConsoleEntries } from '../src/consoleEntries.ts';

test('showing raw console output preserves backend chronology', () => {
  const entries = [
    { line: 'compile started', presentation: { kind: 'summary' } },
    { line: '$ iverilog', presentation: { kind: 'command' } },
    { line: 'backend detail', presentation: { kind: 'raw' } },
    { line: 'source error', presentation: { kind: 'diagnostic' } },
  ];
  assert.deepEqual(
    visibleConsoleEntries(entries, true).map((entry) => entry.line),
    entries.map((entry) => entry.line),
  );
  assert.deepEqual(
    visibleConsoleEntries(entries, false).map((entry) => entry.line),
    ['compile started', 'source error'],
  );
});
