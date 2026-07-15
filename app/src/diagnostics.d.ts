export function parseDiagnostic(line: string): {
  path: string;
  line: number;
  column: number;
  message: string;
} | null;
