const path = require('node:path');
const fs = require('node:fs');

const UNSUPPORTED_SOURCE_CONSTRUCTS = [
  { match: /\bcovergroup\b/i, label: 'covergroup/functional coverage' },
  { match: /\b(?:mailbox|program)\b/i, label: 'verification-only SystemVerilog construct' },
  { match: /\bclass\b/i, label: 'class-based verification' },
  { match: /\b(?:randomize|randc?)\b/i, label: 'constrained randomization' },
];

const ERROR_PATTERNS = [
  {
    id: 'unsupported-construct',
    match: /(?:sorry:|not currently supported|unsupported|%Error-UNSUPPORTED)/i,
    title: 'This construct is not supported by the selected backend',
    explain: 'Try the simpler synthesizable form shown in OpenBench Help, or switch backends. The raw tool message below remains authoritative.',
  },
  {
    id: 'undeclared-name',
    match: /(?:unable to bind|can(?:not|'t) find definition|undeclared|not declared|unknown identifier)/i,
    title: 'This name has not been declared here',
    explain: 'Check its spelling, declare it before use, or make sure the file/package that defines it is included in Project Settings.',
  },
  {
    id: 'port-mismatch',
    match: /(?:port .*?(?:not found|does not exist|is not a port)|pin .*?not found|wrong number of ports)/i,
    title: 'The module connection does not match its port list',
    explain: 'Compare the instance connections with the module declaration. Named connections such as .clk(clk) make mismatches easier to spot.',
  },
  {
    id: 'backend-runtime-dependency',
    match: /(?:error while loading shared libraries|cannot open shared object file|dyld:.*library not loaded)/i,
    title: 'The bundled backend is missing a native runtime dependency',
    explain: 'This is an OpenBench installation/package problem, not an error in your HDL. Reinstall the native package or report this raw line with your operating system and architecture.',
  },
  {
    id: 'missing-include',
    match: /(?:include file|cannot open (?:source )?file .*\.(?:v|sv|vh|svh)|can't open include)/i,
    title: 'A source or include file could not be found',
    explain: 'Check the filename and add its containing folder under Settings → Include paths.',
  },
  {
    id: 'multiple-drivers',
    match: /(?:multiple.*drivers?|driven.*multiple|multidriven)/i,
    title: 'More than one process is driving the same signal',
    explain: 'A variable should normally be assigned by one always block. Combine the assignments or choose a single owner for the signal.',
  },
  {
    id: 'width-mismatch',
    match: /(?:width|expects? \d+ bits?|truncate|too (?:many|few) bits)/i,
    title: 'Connected values have different bit widths',
    explain: 'Check ranges such as [7:0]. Resize or explicitly slice/extend the value so both sides have the intended width.',
  },
  {
    id: 'syntax',
    match: /(?:syntax error|unexpected (?:token|identifier|end|IDENTIFIER)|malformed statement|invalid module item)/i,
    title: 'The simulator could not parse this statement',
    explain: 'Look just before the highlighted location for a missing semicolon, unmatched begin/end, parenthesis, or misspelled keyword.',
  },
];

const INFO_PATTERNS = [
  { id: 'vcd-open', match: /VCD info:\s*dumpfile\s+(.+?)\s+opened for output/i, title: 'Waveform recording started', explain: (match) => `The simulator is writing real signal changes to ${match[1]}.` },
  { id: 'planned-finish', match: /\$finish called at\s+(\d+)/i, title: 'The testbench reached its finish point', explain: (match) => `Simulation ended normally at time ${match[1]}; the waveform up to that point is available.` },
  { id: 'yosys-top', match: /Top module:\s+\\?([^\s.]+)/i, title: 'Yosys selected the design top', explain: (match) => `${match[1]} is the root module being elaborated into the RTL schematic.` },
  { id: 'yosys-register', match: /Creating register for signal\s+[`']?([^`']+)/i, title: 'Yosys inferred a hardware register', explain: (match) => `${match[1].trim()} becomes stored state and is drawn with a register symbol.` },
  { id: 'yosys-write-json', match: /Executing WRITE_JSON pass/i, title: 'RTL netlist generation is complete', explain: () => 'OpenBench will render the resulting Yosys JSON; HDL text is not hand-parsed for the schematic.' },
];

function sourceLocation(line, projectRoot) {
  const match = line.match(/(?:%Error(?:-[A-Z0-9_]+)?:\s*)?(.+?\.(?:sv|svh|v|vh)):(\d+)(?::(\d+))?/i);
  if (!match) return null;
  let file = match[1].trim().replace(/^['"]|['"]$/g, '');
  const absolute = path.resolve(projectRoot, file);
  const relative = path.relative(projectRoot, absolute);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) file = relative;
  return { path: file.replaceAll('\\', '/'), line: Number(match[2]), column: match[3] ? Number(match[3]) : 1 };
}

function translateErrorLine(line, backend, projectRoot) {
  const location = sourceLocation(line, projectRoot);
  const sourceConstruct = location && /(?:syntax error|invalid module item)/i.test(line)
    ? unsupportedConstructAt(projectRoot, location)
    : null;
  const errorPattern = sourceConstruct
    ? ERROR_PATTERNS.find((candidate) => candidate.id === 'unsupported-construct')
    : ERROR_PATTERNS.find((candidate) => candidate.match.test(line));
  const infoMatch = !errorPattern ? INFO_PATTERNS.map((candidate) => ({ pattern: candidate, match: line.match(candidate.match) })).find((item) => item.match) : null;
  const pattern = errorPattern || infoMatch?.pattern;
  if (!pattern) return null;
  const explanation = sourceConstruct
    ? `${sourceConstruct} is outside OpenBench's beginner-oriented simulator overlap. Use synthesizable RTL plus an editable procedural testbench, or choose a backend that supports it. Raw output remains authoritative.`
    : typeof pattern.explain === 'function' ? pattern.explain(infoMatch.match) : pattern.explain;
  return { id: pattern.id, backend, title: pattern.title, explanation, location, raw: line };
}

function unsupportedConstructAt(projectRoot, location) {
  try {
    const absolute = path.resolve(projectRoot, location.path);
    const line = fs.readFileSync(absolute, 'utf8').split(/\r?\n/)[location.line - 1] || '';
    return UNSUPPORTED_SOURCE_CONSTRUCTS.find((construct) => construct.match.test(line))?.label || null;
  } catch { return null; }
}

function looksLikeUnmatchedError(line) {
  return /(?:\berror\b|sorry:|unsupported|fatal)/i.test(line);
}

function createErrorTranslator({ backend, projectRoot }) {
  const buffers = { stdout: '', stderr: '' };
  const consume = (stream, text, final = false) => {
    const joined = buffers[stream] + text;
    const lines = joined.split(/\r?\n/);
    const trailing = lines.pop() || '';
    buffers[stream] = final ? '' : trailing;
    if (final && trailing) lines.push(trailing);
    const translations = [];
    const unmatched = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const translated = translateErrorLine(line, backend, projectRoot);
      if (translated) translations.push(translated);
      else if (looksLikeUnmatchedError(line)) unmatched.push({ backend, stream, line });
    }
    return { translations, unmatched };
  };
  return { push: (stream, text) => consume(stream, text), flush: () => ({ stdout: consume('stdout', '', true), stderr: consume('stderr', '', true) }) };
}

function formatTranslation(translation) {
  const prefix = translation.location ? `${translation.location.path}:${translation.location.line}:${translation.location.column}: ` : '';
  return `${prefix}💡 ${translation.title} — ${translation.explanation}\n`;
}

module.exports = { ERROR_PATTERNS, INFO_PATTERNS, UNSUPPORTED_SOURCE_CONSTRUCTS, createErrorTranslator, formatTranslation, looksLikeUnmatchedError, sourceLocation, translateErrorLine, unsupportedConstructAt };
