function visibleNetNames(module) {
  const namesByBit = new Map();
  for (const [name, net] of Object.entries(module.netnames || {})) {
    for (const bit of net.bits || []) {
      if (typeof bit !== 'number') continue;
      const candidates = namesByBit.get(bit) || [];
      candidates.push({
        name,
        hidden: Boolean(net.hide_name),
        source: net.attributes?.src || null,
      });
      namesByBit.set(bit, candidates);
    }
  }
  for (const candidates of namesByBit.values())
    candidates.sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.name.length - b.name.length);
  return namesByBit;
}

export function findTopModule(netlist) {
  const modules = Object.entries(netlist.modules || {});
  return (
    modules.find(
      ([, module]) => module.attributes?.top === '00000000000000000000000000000001',
    )?.[0] ||
    modules[0]?.[0] ||
    null
  );
}

export function classifyCellType(type, isModule = false) {
  if (isModule) return 'module';
  const clean = String(type || '')
    .replace(/^\\?\$/, '')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (/(?:ad?ff|sdff|dffe|ff|latch)/.test(clean)) return 'register';
  if (/mux/.test(clean)) return 'mux';
  if (/(?:mem|ram|rom)/.test(clean)) return 'memory';
  if (/(?:add|sub|mul|div|mod|alu)/.test(clean)) return 'arithmetic';
  if (/(?:eq|ne|lt|le|gt|ge|compare)/.test(clean)) return 'compare';
  if (/(?:and|or|xor|xnor|not|reduce|logic)/.test(clean)) return 'logic';
  return 'generic';
}

function friendlyCellName(type, symbol, ordinal) {
  const clean = String(type || '')
    .replace(/^\\?\$/, '')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const operation = clean.includes('not')
    ? 'NOT gate'
    : clean.includes('xnor')
      ? 'XNOR gate'
      : clean.includes('xor')
        ? 'XOR gate'
        : clean.includes('nand')
          ? 'NAND gate'
          : clean.includes('and')
            ? 'AND gate'
            : clean.includes('nor')
              ? 'NOR gate'
              : clean.includes('or')
                ? 'OR gate'
                : clean.includes('add')
                  ? 'Adder'
                  : clean.includes('sub')
                    ? 'Subtractor'
                    : clean.includes('mul')
                      ? 'Multiplier'
                      : clean.includes('eq')
                        ? 'Equality check'
                        : clean.includes('mux')
                          ? 'Mux'
                          : symbol === 'register'
                            ? 'Register'
                            : symbol === 'memory'
                              ? 'Memory'
                              : symbol === 'module'
                                ? 'Module'
                                : 'Logic block';
  return `${operation} ${ordinal + 1}`;
}

export function buildModuleGraph(netlist, moduleName) {
  const module = netlist.modules?.[moduleName];
  if (!module) throw new Error(`Module '${moduleName}' was not found in the Yosys netlist.`);
  const nodes = [];
  const endpointsByBit = new Map();
  const namesByBit = visibleNetNames(module);

  const addEndpoint = (bit, endpoint) => {
    if (typeof bit !== 'number') return;
    const current = endpointsByBit.get(bit) || { drivers: [], sinks: [] };
    current[endpoint.role].push(endpoint);
    endpointsByBit.set(bit, current);
  };

  let portIndex = 0;
  for (const [name, port] of Object.entries(module.ports || {})) {
    const net = module.netnames?.[name];
    const nodeId = `port_${portIndex++}`;
    nodes.push({
      id: nodeId,
      kind: 'port',
      symbol: 'port',
      name,
      type: port.direction,
      direction: port.direction,
      width: port.bits?.length || 1,
      source: net?.attributes?.src || module.attributes?.src || null,
    });
    for (const bit of port.bits || []) {
      if (port.direction === 'input' || port.direction === 'inout')
        addEndpoint(bit, { nodeId, port: name, role: 'drivers' });
      if (port.direction === 'output' || port.direction === 'inout')
        addEndpoint(bit, { nodeId, port: name, role: 'sinks' });
    }
  }

  let cellIndex = 0;
  for (const [name, cell] of Object.entries(module.cells || {})) {
    const ordinal = cellIndex++;
    const nodeId = `cell_${ordinal}`;
    const ports = Object.entries(cell.connections || {}).map(([portName, bits]) => ({
      name: portName,
      direction: cell.port_directions?.[portName] || 'unknown',
      width: bits.length,
    }));
    const isModule = Boolean(netlist.modules?.[cell.type]);
    const symbol = classifyCellType(cell.type, isModule);
    const generatedName =
      Boolean(cell.hide_name) || String(name).startsWith('$') || String(name).includes('$');
    const displayName = generatedName
      ? friendlyCellName(cell.type, symbol, ordinal)
      : name.replace(/^\\/, '');
    nodes.push({
      id: nodeId,
      kind: isModule ? 'module' : 'cell',
      symbol,
      name: displayName,
      yosysName: name,
      type: cell.type,
      width: 1,
      source: cell.attributes?.src || module.attributes?.src || null,
      moduleRef: isModule ? cell.type : null,
      ports,
    });
    for (const [portName, bits] of Object.entries(cell.connections || {})) {
      const direction = cell.port_directions?.[portName];
      for (const bit of bits) {
        if (direction === 'output' || direction === 'inout')
          addEndpoint(bit, { nodeId, port: portName, role: 'drivers' });
        if (direction === 'input' || direction === 'inout')
          addEndpoint(bit, { nodeId, port: portName, role: 'sinks' });
      }
    }
  }

  const aggregated = new Map();
  for (const [bit, endpoints] of endpointsByBit.entries()) {
    const named = namesByBit.get(bit)?.[0];
    for (const driver of endpoints.drivers) {
      for (const sink of endpoints.sinks) {
        if (driver.nodeId === sink.nodeId) continue;
        const netName = named?.name || `bit ${bit}`;
        const key = `${driver.nodeId}|${sink.nodeId}|${netName}`;
        const edge = aggregated.get(key) || {
          id: `edge_${aggregated.size}`,
          source: driver.nodeId,
          target: sink.nodeId,
          sourcePort: driver.port,
          targetPort: sink.port,
          netName,
          sourceLocation: named?.source || null,
          bits: [],
        };
        edge.bits.push(bit);
        aggregated.set(key, edge);
      }
    }
  }

  return {
    moduleName,
    source: module.attributes?.src || null,
    nodes,
    edges: [...aggregated.values()],
  };
}

export function sourceForNet(netlist, netName) {
  const parts = netName
    .replace(/\s*\[[^\]]+\]\s*$/, '')
    .split('.')
    .map((part) => part.replace(/^\\/, ''));
  const clean = parts.at(-1);
  let moduleName = findTopModule(netlist);
  if (moduleName) {
    for (const segment of parts.slice(0, -1)) {
      const module = netlist.modules?.[moduleName];
      const cell = Object.entries(module?.cells || {}).find(
        ([name]) => name.replace(/^\\/, '') === segment,
      )?.[1];
      if (cell && netlist.modules?.[cell.type]) moduleName = cell.type;
    }
    const scopedModule = netlist.modules?.[moduleName];
    const scopedNet = Object.entries(scopedModule?.netnames || {}).find(
      ([name]) => name.replace(/^\\/, '') === clean,
    )?.[1];
    if (scopedNet?.attributes?.src) return scopedNet.attributes.src;
  }
  for (const module of Object.values(netlist.modules || {})) {
    const match = Object.entries(module.netnames || {}).find(
      ([name]) => name.replace(/^\\/, '') === clean,
    );
    if (match?.[1]?.attributes?.src) return match[1].attributes.src;
  }
  return null;
}
