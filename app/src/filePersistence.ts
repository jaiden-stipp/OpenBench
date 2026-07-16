import type { OpenFile } from './types/ui';

export type FileSnapshot = Pick<OpenFile, 'path' | 'content'>;

export async function persistDirtyFiles(
  openFiles: readonly OpenFile[],
  persist: (file: FileSnapshot) => Promise<void>,
) {
  const snapshots = openFiles
    .filter((file) => file.content !== file.savedContent)
    .map(({ path, content }) => ({ path, content }));

  await Promise.all(snapshots.map(persist));
  return snapshots;
}

export function markSnapshotsSaved(openFiles: readonly OpenFile[], snapshots: FileSnapshot[]) {
  const savedByPath = new Map(snapshots.map((file) => [file.path, file.content]));
  return openFiles.map((file) => {
    const savedContent = savedByPath.get(file.path);
    return savedContent !== undefined && file.content === savedContent
      ? { ...file, savedContent }
      : file;
  });
}
