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
    for (const packageName of source.declarations) {
      const files = providers.get(packageName) || [];
      files.push(source.file);
      providers.set(packageName, files);
    }
  const duplicates = [...providers].filter(([, files]) => files.length > 1);
  if (duplicates.length) {
    const details = duplicates
      .map(([packageName, files]) => `${packageName}: ${files.join(', ')}`)
      .join('; ');
    throw new Error(`Duplicate SystemVerilog package providers: ${details}`);
  }
  return providers;
}

function dependencyGraph(sources, providers) {
  const dependencies = new Map();
  const dependents = new Map(sources.map((source) => [source.file, []]));
  for (const source of sources) {
    const required = new Set(
      source.references
        .map((packageName) => providers.get(packageName)?.[0])
        .filter((provider) => provider && provider !== source.file),
    );
    dependencies.set(source.file, required);
    for (const provider of required) dependents.get(provider).push(source.file);
  }
  return { dependencies, dependents };
}

function stableTopologicalSort(sources, graph) {
  const indexByFile = new Map(sources.map((source) => [source.file, source.index]));
  const ready = new StableReadyQueue(indexByFile);
  for (const source of sources)
    if (graph.dependencies.get(source.file).size === 0) ready.push(source.file);
  const ordered = [];
  while (ready.size) {
    const file = ready.pop();
    ordered.push(file);
    for (const dependent of graph.dependents.get(file)) {
      const required = graph.dependencies.get(dependent);
      required.delete(file);
      if (required.size === 0) ready.push(dependent);
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

class StableReadyQueue {
  constructor(indexByFile) {
    this.heap = [];
    this.indexByFile = indexByFile;
  }

  get size() {
    return this.heap.length;
  }

  push(file) {
    this.heap.push(file);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.before(this.heap[parent], file)) break;
      this.heap[index] = this.heap[parent];
      index = parent;
    }
    this.heap[index] = file;
  }

  pop() {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length && last !== undefined) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= this.heap.length) break;
        const right = left + 1;
        const child =
          right < this.heap.length && this.before(this.heap[right], this.heap[left]) ? right : left;
        if (this.before(last, this.heap[child])) break;
        this.heap[index] = this.heap[child];
        index = child;
      }
      this.heap[index] = last;
    }
    return first;
  }

  before(left, right) {
    return this.indexByFile.get(left) <= this.indexByFile.get(right);
  }
}

module.exports = { orderSourceFiles };
