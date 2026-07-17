import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import * as localMonaco from 'monaco-editor';
import { parseDiagnostic } from '../diagnostics';
import { markSnapshotsSaved, persistDirtyFiles } from '../filePersistence';
import type { OpenFile } from '../types/ui';

type InlineLintOptions = {
  lintRequestRef: MutableRefObject<number>;
  setLintStatus: Dispatch<SetStateAction<'idle' | 'checking' | 'clean' | 'issues'>>;
};

export function useInlineLint(options: InlineLintOptions) {
  const { lintRequestRef, setLintStatus } = options;
  return useCallback(
    async (filePath: string) => {
      const request = ++lintRequestRef.current;
      setLintStatus('checking');
      try {
        const result = await window.openbench.runInlineLint();
        if (request !== lintRequestRef.current) return;
        if (result.skipped) {
          setLintStatus('idle');
          return;
        }
        const normalizedPath = normalizePath(filePath);
        const diagnostics = collectDiagnostics(result.output, normalizedPath);
        const model = localMonaco.editor
          .getModels()
          .find((item) => normalizePath(item.uri.path.replace(/^\//, '')).endsWith(normalizedPath));
        if (model) localMonaco.editor.setModelMarkers(model, 'openbench-inline-lint', diagnostics);
        setLintStatus(diagnostics.length || result.code !== 0 ? 'issues' : 'clean');
      } catch {
        if (request === lintRequestRef.current) {
          clearInlineLintMarkers();
          setLintStatus('idle');
        }
      }
    },
    [lintRequestRef, setLintStatus],
  );
}

export function clearInlineLintMarkers() {
  for (const model of localMonaco.editor.getModels())
    localMonaco.editor.setModelMarkers(model, 'openbench-inline-lint', []);
}

function collectDiagnostics(output: string, normalizedPath: string) {
  return output
    .replaceAll('\r\n', '\n')
    .split('\n')
    .flatMap((line) => {
      const diagnostic = parseDiagnostic(line.replace(/^%[^:]+:\s*/, ''));
      if (!diagnostic) return [];
      const diagnosticPath = diagnostic.path.toLowerCase();
      if (!(diagnosticPath === normalizedPath || diagnosticPath.endsWith(`/${normalizedPath}`)))
        return [];
      return [
        {
          severity: /warning/i.test(diagnostic.message)
            ? localMonaco.MarkerSeverity.Warning
            : localMonaco.MarkerSeverity.Error,
          message: diagnostic.message || 'HDL syntax error',
          startLineNumber: diagnostic.line,
          startColumn: diagnostic.column,
          endLineNumber: diagnostic.line,
          endColumn: diagnostic.column + 1,
        },
      ];
    });
}

function normalizePath(path: string) {
  return path.replaceAll('\\', '/').toLowerCase();
}

type FileSaveOptions = {
  hasRunSimulation: boolean;
  openFile: OpenFile | null;
  openFiles: OpenFile[];
  project: ProjectData | null;
  runInlineLint: (path: string) => Promise<void>;
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  updateOpenFile: (updater: (file: OpenFile) => OpenFile) => void;
  watchMode: boolean;
  watchRunRef: MutableRefObject<(() => Promise<void>) | null>;
  watchTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export function useFilePersistence(options: FileSaveOptions) {
  const {
    hasRunSimulation,
    openFile,
    openFiles,
    project,
    runInlineLint,
    setOpenFiles,
    setStatus,
    updateOpenFile,
    watchMode,
    watchRunRef,
    watchTimerRef,
  } = options;
  const save = useCallback(
    async (triggerWatch = true) =>
      saveCurrentFile(
        {
          hasRunSimulation,
          openFile,
          setStatus,
          updateOpenFile,
          watchMode,
          watchRunRef,
          watchTimerRef,
        },
        triggerWatch,
      ),
    [hasRunSimulation, openFile, setStatus, updateOpenFile, watchMode, watchRunRef, watchTimerRef],
  );
  const saveAllDirtyFiles = useCallback(async () => {
    try {
      const result = await persistDirtyFiles(openFiles, async (file) => {
        await window.openbench.writeFile(file.path, file.content);
        await window.openbench.clearRecoveryDraft(file.path);
      });
      if (result.successful.length)
        setOpenFiles((current) => markSnapshotsSaved(current, result.successful));
      if (result.failed.length) {
        const names = result.failed.map(({ snapshot }) => snapshot.path).join(', ');
        throw new AggregateError(
          result.failed.map(({ reason }) => reason),
          `Could not save ${names}. ${result.successful.length} other file${result.successful.length === 1 ? ' was' : 's were'} saved.`,
        );
      }
      if (!result.successful.length) return;
      setStatus(
        `Saved ${result.successful.length} changed file${result.successful.length === 1 ? '' : 's'}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Save all failed: ${message}`);
      throw error;
    }
  }, [openFiles, setOpenFiles, setStatus]);
  useAutosave({ openFile, project, runInlineLint, setOpenFiles, setStatus });
  useSaveShortcut(save);
  return { save, saveAllDirtyFiles };
}

type CurrentFileSaveOptions = Pick<
  FileSaveOptions,
  | 'hasRunSimulation'
  | 'openFile'
  | 'setStatus'
  | 'updateOpenFile'
  | 'watchMode'
  | 'watchRunRef'
  | 'watchTimerRef'
>;

async function saveCurrentFile(options: CurrentFileSaveOptions, triggerWatch: boolean) {
  if (!options.openFile) return;
  try {
    await window.openbench.writeFile(options.openFile.path, options.openFile.content);
    options.updateOpenFile((file) => ({ ...file, savedContent: file.content }));
    await window.openbench.clearRecoveryDraft(options.openFile.path);
    if (triggerWatch && options.watchMode && options.hasRunSimulation) {
      if (options.watchTimerRef.current) clearTimeout(options.watchTimerRef.current);
      options.watchTimerRef.current = setTimeout(() => void options.watchRunRef.current?.(), 450);
      options.setStatus(`Saved ${options.openFile.path}; watch rerun scheduled`);
    } else options.setStatus(`Saved ${options.openFile.path}`);
  } catch (error) {
    options.setStatus(error instanceof Error ? error.message : String(error));
  }
}

type AutosaveOptions = Pick<
  FileSaveOptions,
  'openFile' | 'project' | 'runInlineLint' | 'setOpenFiles' | 'setStatus'
>;

function useAutosave(options: AutosaveOptions) {
  const { openFile, project, runInlineLint, setOpenFiles, setStatus } = options;
  useEffect(() => {
    const file = openFile;
    if (!project || !file || file.content === file.savedContent) return;
    const recoveryTimer = setTimeout(
      () => void window.openbench.saveRecoveryDraft(file.path, file.content),
      120,
    );
    const autosaveTimer = setTimeout(
      () => void autosaveFile(file, { runInlineLint, setOpenFiles, setStatus }),
      900,
    );
    return () => {
      clearTimeout(recoveryTimer);
      clearTimeout(autosaveTimer);
    };
  }, [openFile, project, runInlineLint, setOpenFiles, setStatus]);
}

type AutosaveFileOptions = Pick<FileSaveOptions, 'runInlineLint' | 'setOpenFiles' | 'setStatus'>;

async function autosaveFile(file: OpenFile, options: AutosaveFileOptions) {
  try {
    await window.openbench.writeFile(file.path, file.content);
    options.setOpenFiles((current) =>
      current.map((item) =>
        item.path === file.path && item.content === file.content
          ? { ...item, savedContent: file.content }
          : item,
      ),
    );
    await window.openbench.clearRecoveryDraft(file.path);
    options.setStatus(`Autosaved ${file.path}`);
    await options.runInlineLint(file.path);
  } catch (error) {
    options.setStatus(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function useSaveShortcut(save: (triggerWatch?: boolean) => Promise<void>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);
}
