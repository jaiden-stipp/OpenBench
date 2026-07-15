export function parseYosysSource(source, projectRoot) {
  const first = source.split('|')[0];
  const match = first.match(/^(.*):(\d+)\.(\d+)(?:-\d+\.\d+)?$/);
  if (!match) return null;
  const normalizedRoot = projectRoot.replaceAll('\\', '/').replace(/\/$/, '');
  const normalizedFile = match[1].replaceAll('\\', '/');
  const relative = normalizedFile.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalizedFile.slice(normalizedRoot.length + 1)
    : normalizedFile;
  return { path: relative, line: Number(match[2]), column: Number(match[3]) };
}
