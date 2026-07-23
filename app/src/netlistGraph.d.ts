export type YosysBit = number | string;
export type YosysCell = {
  type: string;
  hide_name?: number;
  parameters?: Record<string, string>;
  attributes?: Record<string, string>;
  port_directions?: Record<string, string>;
  connections?: Record<string, YosysBit[]>;
};
export type YosysModule = {
  attributes?: Record<string, string>;
  ports?: Record<string, { direction: string; bits: YosysBit[] }>;
  cells?: Record<string, YosysCell>;
  netnames?: Record<
    string,
    { hide_name?: number; bits?: YosysBit[]; attributes?: Record<string, string> }
  >;
};
export type YosysNetlist = { creator?: string; modules: Record<string, YosysModule> };
export type SchematicSymbol =
  | 'port'
  | 'register'
  | 'mux'
  | 'memory'
  | 'arithmetic'
  | 'compare'
  | 'logic'
  | 'module'
  | 'group'
  | 'generic';
export type SchematicNode = {
  id: string;
  kind: 'port' | 'cell' | 'module';
  symbol: SchematicSymbol;
  name: string;
  yosysName?: string;
  type: string;
  direction?: string;
  width: number;
  source: string | null;
  moduleRef?: string | null;
  ports?: Array<{ name: string; direction: string; width: number }>;
};
export type SchematicEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
  netName: string;
  sourceLocation: string | null;
  bits: number[];
};
export type ModuleGraph = {
  moduleName: string;
  source: string | null;
  nodes: SchematicNode[];
  edges: SchematicEdge[];
  overview?: boolean;
};
export function findTopModule(netlist: YosysNetlist): string | null;
export function buildModuleGraph(netlist: YosysNetlist, moduleName: string): ModuleGraph;
export function buildOverviewGraph(netlist: YosysNetlist, moduleName: string): ModuleGraph;
export function sourceForNet(netlist: YosysNetlist, netName: string): string | null;
