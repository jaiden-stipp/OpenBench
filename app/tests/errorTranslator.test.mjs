import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ERROR_PATTERNS,
  INFO_PATTERNS,
  createErrorTranslator,
  formatTranslation,
  translateErrorLine,
  unsupportedConstructAt,
} = require('../electron/errorTranslator.cjs');

test('keeps an explicit growing error pattern list', () => {
  assert.ok(ERROR_PATTERNS.length >= 7);
  assert.equal(new Set(ERROR_PATTERNS.map((pattern) => pattern.id)).size, ERROR_PATTERNS.length);
});

test('translates useful simulator and Yosys milestones without hiding raw output', () => {
  assert.ok(INFO_PATTERNS.length >= 5);
  const vcd = translateErrorLine(
    'VCD info: dumpfile waves.vcd opened for output.',
    'iverilog',
    path.resolve('project'),
  );
  assert.equal(vcd.id, 'vcd-open');
  assert.match(vcd.explanation, /waves\.vcd/);
  const register = translateErrorLine(
    "Creating register for signal `\\top.state' using process",
    'yosys',
    path.resolve('project'),
  );
  assert.equal(register.id, 'yosys-register');
  assert.match(register.title, /hardware register/);
  assert.equal(
    register.explanation,
    'top.state becomes stored state and is drawn with a register symbol.',
  );
  const noisyRegister = translateErrorLine(
    "Creating register for signal `\\simple_cpu.program_counter' using process `\\simple_cpu.$proc$C:/Users/student/simple_cpu.sv:61$1'.",
    'yosys',
    path.resolve('project'),
  );
  assert.doesNotMatch(noisyRegister.explanation, /\$proc|C:\//);
  const memory = translateErrorLine(
    'Warning: Replacing memory \\registers with list of registers. See rtl/register_file.sv:18',
    'yosys',
    path.resolve('project'),
  );
  assert.equal(memory.id, 'yosys-memory-registers');
  assert.match(memory.explanation, /normal for a small memory/);
});

test('translates an Icarus syntax error and keeps its exact source location', () => {
  const translated = translateErrorLine(
    'rtl/fsm.sv:17: syntax error',
    'iverilog',
    path.resolve('project'),
  );
  assert.equal(translated.id, 'syntax');
  assert.deepEqual(translated.location, { path: 'rtl/fsm.sv', line: 17, column: 1 });
  assert.match(formatTranslation(translated), /^rtl\/fsm\.sv:17:1: 💡/);
});

test('translates Verilator unsupported errors at the user line', () => {
  const translated = translateErrorLine(
    '%Error-UNSUPPORTED: design.sv:9:4: Unsupported: program blocks',
    'verilator',
    path.resolve('project'),
  );
  assert.equal(translated.id, 'unsupported-construct');
  assert.equal(translated.location.line, 9);
});

test('buffers split tool output and records unmatched errors separately', () => {
  const translator = createErrorTranslator({
    backend: 'iverilog',
    projectRoot: path.resolve('project'),
  });
  assert.equal(translator.push('stderr', 'rtl/top.sv:3: synt').translations.length, 0);
  const complete = translator.push('stderr', 'ax error\ninternal error code 42\n');
  assert.equal(complete.translations.length, 1);
  assert.equal(complete.unmatched.length, 1);
});

test('does not blame HDL include paths for a missing packaged shared library', () => {
  const translated = translateErrorLine(
    'iverilog: error while loading shared libraries: libfoo.so: cannot open shared object file: No such file or directory',
    'iverilog',
    path.resolve('project'),
  );
  assert.equal(translated.id, 'backend-runtime-dependency');
  assert.match(translated.title, /native runtime dependency/);
});

test('source construct lookup caches source lines for one translation run', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbench-translator-cache-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'top.sv'), 'covergroup coverage;\nendgroup\n');
  const cache = new Map();
  const location = { path: 'top.sv', line: 1, column: 1 };
  assert.match(unsupportedConstructAt(root, location, cache), /coverage/);
  fs.writeFileSync(path.join(root, 'top.sv'), 'module top; endmodule\n');
  assert.match(unsupportedConstructAt(root, location, cache), /coverage/);
  assert.equal(cache.size, 1);
});
