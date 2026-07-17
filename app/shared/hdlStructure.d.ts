export type HdlFile = { path: string; content: string };
export type HdlModule = { name: string; file: string };
export type HdlInstantiation = { module: string; instance: string; file: string };

export function parseHdlStructure(content: string): {
  modules: string[];
  instantiations: Array<Omit<HdlInstantiation, 'file'>>;
};

export function tokenizeHdl(content: string): string[];
export function hasHdlToken(content: string, expected: string): boolean;
export function parsePackageReferences(content: string): {
  declarations: string[];
  references: string[];
};

export function analyzeHdlFiles(files: HdlFile[]): {
  roles: Record<string, 'design' | 'testbench' | 'include'>;
  modules: HdlModule[];
  testbenches: HdlModule[];
  instantiations: HdlInstantiation[];
  topCandidates: HdlModule[];
  simulationCandidates: HdlModule[];
  missingModules: string[];
  duplicates: Array<{ name: string; files: string[] }>;
  suggestedTop: string;
  suggestedSimulationTop: string;
};
