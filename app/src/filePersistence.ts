import type { OpenFile } from './types/ui';

export type FileSnapshot = Pick<OpenFile, 'path' | 'content'>;
export type FailedFileSnapshot = { snapshot: FileSnapshot; reason: unknown };

export async function persistDirtyFiles(
  openFiles: readonly OpenFile[],
  persist: (file: FileSnapshot) => Promise<void>,
) {
  const snapshots = openFiles
    .filter((file) => file.content !== file.savedContent)
    .map(({ path, content }) => ({ path, content }));

  const results = await Promise.allSettled(
    snapshots.map(async (snapshot) => {
      await persist(snapshot);
      return snapshot;
    }),
  );
  const successful: FileSnapshot[] = [];
  const failed: FailedFileSnapshot[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') successful.push(result.value);
    else failed.push({ snapshot: snapshots[index], reason: result.reason });
  });
  return { successful, failed };
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
