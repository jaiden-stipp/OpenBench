const STORAGE_PREFIX = 'rtldeck.';
const LEGACY_STORAGE_PREFIXES = ['openbench.', 'rtlbench.'];

export function readPreference(name: string): string | null {
  const current = localStorage.getItem(`${STORAGE_PREFIX}${name}`);
  if (current !== null) return current;
  for (const prefix of LEGACY_STORAGE_PREFIXES) {
    const legacy = localStorage.getItem(`${prefix}${name}`);
    if (legacy !== null) return legacy;
  }
  return null;
}

export function writePreference(name: string, value: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}${name}`, value);
}
