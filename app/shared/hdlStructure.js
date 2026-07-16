const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const NON_MODULE_KEYWORDS = new Set([
  'always',
  'always_comb',
  'always_ff',
  'always_latch',
  'assign',
  'begin',
  'case',
  'casex',
  'casez',
  'else',
  'end',
  'endcase',
  'endfunction',
  'endgenerate',
  'endmodule',
  'endtask',
  'for',
  'foreach',
  'forever',
  'function',
  'generate',
  'if',
  'initial',
  'input',
  'interface',
  'logic',
  'module',
  'output',
  'parameter',
  'program',
  'reg',
  'repeat',
  'return',
  'task',
  'typedef',
  'wait',
  'while',
  'wire',
]);

const BUILTIN_PRIMITIVES = new Set([
  'and',
  'buf',
  'bufif0',
  'bufif1',
  'cmos',
  'nand',
  'nmos',
  'nor',
  'not',
  'notif0',
  'notif1',
  'or',
  'pmos',
  'pullup',
  'pulldown',
  'rcmos',
  'rnmos',
  'rpmos',
  'rtran',
  'rtranif0',
  'rtranif1',
  'tran',
  'tranif0',
  'tranif1',
  'xnor',
  'xor',
]);

export function analyzeHdlFiles(files) {
  const roles = Object.fromEntries(files.map((file) => [file.path, classifyFile(file)]));
  const parsed = files.map((file) => ({ ...file, ...parseHdlStructure(file.content) }));
  const modules = parsed.flatMap((file) =>
    file.modules.map((name) => ({ name, file: file.path })),
  );
  const moduleOwners = new Map();
  for (const module of modules) {
    const owners = moduleOwners.get(module.name) || [];
    owners.push(module.file);
    moduleOwners.set(module.name, owners);
  }

  const testbenches = modules.filter((module) => roles[module.file] === 'testbench');
  const designModules = modules.filter((module) => roles[module.file] === 'design');
  const instantiations = parsed.flatMap((file) =>
    file.instantiations.map((item) => ({ ...item, file: file.path })),
  );
  const designInstantiated = new Set(
    instantiations
      .filter((item) => roles[item.file] === 'design')
      .map((item) => item.module),
  );
  const testbenchInstantiated = new Set(
    instantiations
      .filter((item) => roles[item.file] === 'testbench')
      .map((item) => item.module),
  );
  const directChildren = new Map();
  for (const item of instantiations.filter((entry) => roles[entry.file] === 'design'))
    directChildren.set(item.file, (directChildren.get(item.file) || 0) + 1);

  const topCandidates = designModules
    .filter((module) => !designInstantiated.has(module.name))
    .sort(
      (left, right) =>
        (directChildren.get(right.file) || 0) - (directChildren.get(left.file) || 0) ||
        left.file.split(/[\\/]/).length - right.file.split(/[\\/]/).length ||
        left.name.localeCompare(right.name),
    );
  const simulationCandidates = testbenches.filter(
    (module) => !testbenchInstantiated.has(module.name),
  );
  const moduleNames = new Set(modules.map((module) => module.name));
  const missingModules = [
    ...new Set(
      instantiations
        .map((item) => item.module)
        .filter(
          (name) =>
            !moduleNames.has(name) &&
            !name.startsWith('$') &&
            !BUILTIN_PRIMITIVES.has(name.toLowerCase()),
        ),
    ),
  ].sort();

  return {
    roles,
    modules,
    testbenches,
    instantiations,
    topCandidates,
    simulationCandidates,
    missingModules,
    duplicates: [...moduleOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([name, owners]) => ({ name, files: owners })),
    suggestedTop: topCandidates[0]?.name || designModules[0]?.name || '',
    suggestedSimulationTop: simulationCandidates[0]?.name || testbenches[0]?.name || '',
  };
}

export function parseHdlStructure(content) {
  const tokens = tokenizeHdl(content);
  const modules = [];
  const instantiations = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'module' && isIdentifier(tokens[index + 1])) modules.push(tokens[index + 1]);
    if (!isPossibleModuleType(token)) continue;
    let cursor = index + 1;
    if (tokens[cursor] === '#') {
      if (tokens[cursor + 1] !== '(') continue;
      cursor = afterBalancedGroup(tokens, cursor + 1);
    }
    const instance = tokens[cursor];
    if (!isIdentifier(instance) || tokens[cursor + 1] !== '(') continue;
    instantiations.push({ module: token, instance });
  }
  return { modules, instantiations };
}

function classifyFile(file) {
  if (/\.(?:vh|svh)$/i.test(file.path)) return 'include';
  if (
    /(?:^|[_.-])(?:tb|testbench)(?:[_.-]|$)/i.test(file.path) ||
    parseHdlStructure(file.content).modules.some((name) =>
      /(?:^|_)(?:tb|testbench)(?:_|$)/i.test(name),
    )
  )
    return 'testbench';
  return 'design';
}

function isPossibleModuleType(token) {
  return (
    isIdentifier(token) &&
    !token.startsWith('$') &&
    !NON_MODULE_KEYWORDS.has(token.toLowerCase()) &&
    !BUILTIN_PRIMITIVES.has(token.toLowerCase())
  );
}

function isIdentifier(token) {
  return typeof token === 'string' && IDENTIFIER.test(token);
}

function afterBalancedGroup(tokens, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    if (tokens[index] === '(') depth += 1;
    else if (tokens[index] === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return tokens.length;
}

function tokenizeHdl(content) {
  const tokens = [];
  let index = 0;
  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (current === '/' && next === '/') {
      index = content.indexOf('\n', index + 2);
      if (index < 0) break;
      continue;
    }
    if (current === '/' && next === '*') {
      const end = content.indexOf('*/', index + 2);
      index = end < 0 ? content.length : end + 2;
      continue;
    }
    if (current === '"') {
      index += 1;
      while (index < content.length) {
        if (content[index] === '\\') index += 2;
        else if (content[index++] === '"') break;
      }
      continue;
    }
    if (/[A-Za-z_$]/.test(current)) {
      let end = index + 1;
      while (end < content.length && /[\w$]/.test(content[end])) end += 1;
      tokens.push(content.slice(index, end));
      index = end;
      continue;
    }
    if ('#(),;'.includes(current)) tokens.push(current);
    index += 1;
  }
  return tokens;
}
