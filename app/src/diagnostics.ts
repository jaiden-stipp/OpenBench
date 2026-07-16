export type Diagnostic = { path: string; line: number; column: number; message: string };

export function parseDiagnostic(line: string): Diagnostic | null {
  const match = line.match(/^(.+?\.(?:sv|svh|v|vh)):(\d+)(?::(\d+))?:\s*(.*)$/i);
  if (!match) return null;
  return {
    path: match[1].replaceAll('\\', '/'),
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : 1,
    message: match[4],
  };
}
