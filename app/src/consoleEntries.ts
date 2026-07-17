export function visibleConsoleEntries<Entry extends { presentation: { kind: string } }>(
  entries: readonly Entry[],
  showRaw: boolean,
) {
  if (showRaw) return [...entries];
  return entries.filter(
    (entry) => entry.presentation.kind !== 'raw' && entry.presentation.kind !== 'command',
  );
}
