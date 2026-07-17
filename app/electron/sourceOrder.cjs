const fsp = require('node:fs/promises');
const path = require('node:path');

const hdlStructure = import('../shared/hdlStructure.js');

async function orderSourceFiles(projectRoot, files) {
  const { parsePackageReferences } = await hdlStructure;
  const sources = await Promise.all(
    files.map(async (file, index) => {
      const content = await fsp.readFile(path.resolve(projectRoot, file), 'utf8');
      return { file, index, ...parsePackageReferences(content) };
    }),
  );
  const providers = packageProviders(sources);
  const graph = dependencyGraph(sources, providers);
  return stableTopologicalSort(sources, graph);
}

function packageProviders(sources) {
  const providers = new Map();
  for (const source of sources)
    for (const packageName of source.declarations) providers.set(packageName, source.file);
  return providers;
}

function dependencyGraph(sources, providers) {
  const dependencies = new Map();
  const dependents = new Map(sources.map((source) => [source.file, []]));
  for (const source of sources) {
    const required = new Set(
      source.imports
        .map((packageName) => providers.get(packageName))
        .filter((provider) => provider && provider !== source.file),
    );
    dependencies.set(source.file, required);
    for (const provider of required) dependents.get(provider).push(source.file);
  }
  return { dependencies, dependents };
}

function stableTopologicalSort(sources, graph) {
  const indexByFile = new Map(sources.map((source) => [source.file, source.index]));
  const ready = sources
    .filter((source) => graph.dependencies.get(source.file).size === 0)
    .map((source) => source.file);
  const ordered = [];
  while (ready.length) {
    const file = ready.shift();
    ordered.push(file);
    for (const dependent of graph.dependents.get(file)) {
      const required = graph.dependencies.get(dependent);
      required.delete(file);
      if (required.size === 0) insertByOriginalIndex(ready, dependent, indexByFile);
    }
  }
  if (ordered.length !== sources.length) {
    const cycle = sources
      .filter((source) => graph.dependencies.get(source.file).size > 0)
      .map((source) => source.file);
    throw new Error(`SystemVerilog package dependency cycle: ${cycle.join(' -> ')}`);
  }
  return ordered;
}

function insertByOriginalIndex(ready, file, indexByFile) {
  const index = indexByFile.get(file);
  let low = 0;
  let high = ready.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (indexByFile.get(ready[middle]) <= index) low = middle + 1;
    else high = middle;
  }
  ready.splice(low, 0, file);
}

module.exports = { orderSourceFiles };
