const LEGACY_STORAGE_PREFIX = 'rtlbench.';
const STORAGE_PREFIX = 'openbench.';

export function readPreference(name: string): string | null {
  return (
    localStorage.getItem(`${STORAGE_PREFIX}${name}`) ??
    localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${name}`)
  );
}

export function writePreference(name: string, value: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}${name}`, value);
}
