export type YosysNetlist = { creator?: string; modules: Record<string, any> };
export type SchematicSymbol = 'port' | 'register' | 'mux' | 'memory' | 'arithmetic' | 'compare' | 'logic' | 'module' | 'generic';
export type SchematicNode = { id: string; kind: 'port' | 'cell' | 'module'; symbol: SchematicSymbol; name: string; yosysName?: string; type: string; direction?: string; width: number; source: string | null; moduleRef?: string | null; ports?: Array<{ name: string; direction: string; width: number }> };
export type SchematicEdge = { id: string; source: string; target: string; sourcePort: string; targetPort: string; netName: string; sourceLocation: string | null; bits: number[] };
export type ModuleGraph = { moduleName: string; source: string | null; nodes: SchematicNode[]; edges: SchematicEdge[] };
export function findTopModule(netlist: YosysNetlist): string | null;
export function buildModuleGraph(netlist: YosysNetlist, moduleName: string): ModuleGraph;
export function sourceForNet(netlist: YosysNetlist, netName: string): string | null;
