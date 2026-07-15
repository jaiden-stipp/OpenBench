export function parseYosysSource(
  source: string,
  projectRoot: string,
): { path: string; line: number; column: number } | null;
