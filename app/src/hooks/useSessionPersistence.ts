import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ActiveView, OpenFile } from '../types/ui';
import type { YosysNetlist } from '../netlistGraph';

type Cursor = { path: string; line: number; column: number } | null;

type SessionSaveOptions = {
  activeFilePath: string | null;
  activeView: ActiveView;
  editorCursor: Cursor;
  openFiles: OpenFile[];
  projectRoot?: string;
  sessionReady: boolean;
  waveformSession: WaveformSession | null;
};

export function useSessionSave(options: SessionSaveOptions) {
  const {
    activeFilePath,
    activeView,
    editorCursor,
    openFiles,
    projectRoot,
    sessionReady,
    waveformSession,
  } = options;
  useEffect(() => {
    if (!sessionReady) return;
    const timer = setTimeout(
      () =>
        void window.openbench.saveSession({
          projectRoot: projectRoot || '',
          openFiles: openFiles.map((file) => file.path),
          activeFile: activeFilePath || '',
          activeView,
          editorCursor,
          waveform: waveformSession ? { ...waveformSession, projectRoot: projectRoot || '' } : null,
        }),
      250,
    );
    return () => clearTimeout(timer);
  }, [
    activeFilePath,
    activeView,
    editorCursor,
    openFiles,
    projectRoot,
    sessionReady,
    waveformSession,
  ]);
}

type SessionRestoreOptions = {
  loadProject: (project: ProjectData, resetWorkspace?: boolean) => Promise<void>;
  setActiveFilePath: Dispatch<SetStateAction<string | null>>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setEditorCursor: Dispatch<SetStateAction<Cursor>>;
  setNetlist: Dispatch<SetStateAction<YosysNetlist | null>>;
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>;
  setRtlTop: Dispatch<SetStateAction<string | null>>;
  setSessionReady: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setWaveformSession: Dispatch<SetStateAction<WaveformSession | null>>;
  waveformWorkerRef: MutableRefObject<Worker | null>;
};

export function useSessionRestore(options: SessionRestoreOptions) {
  const {
    loadProject,
    setActiveFilePath,
    setActiveView,
    setEditorCursor,
    setNetlist,
    setOpenFiles,
    setRtlTop,
    setSessionReady,
    setStatus,
    setWaveformSession,
    waveformWorkerRef,
  } = options;
  useEffect(() => {
    let cancelled = false;
    void restoreSession(
      {
        loadProject,
        setActiveFilePath,
        setActiveView,
        setEditorCursor,
        setNetlist,
        setOpenFiles,
        setRtlTop,
        setSessionReady,
        setStatus,
        setWaveformSession,
        waveformWorkerRef,
      },
      () => cancelled,
    ).finally(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    loadProject,
    setActiveFilePath,
    setActiveView,
    setEditorCursor,
    setNetlist,
    setOpenFiles,
    setRtlTop,
    setSessionReady,
    setStatus,
    setWaveformSession,
    waveformWorkerRef,
  ]);
}

async function restoreSession(options: SessionRestoreOptions, cancelled: () => boolean) {
  try {
    const session = await window.openbench.loadSession();
    const current = session.projectRoot
      ? await window.openbench.restoreProject(session.projectRoot)
      : await window.openbench.getActiveProject();
    if (!current || cancelled()) return;
    await options.loadProject(current, false);
    if (cancelled()) return;
    options.setEditorCursor(session.editorCursor);
    options.setWaveformSession(
      !session.waveform ||
        !session.waveform.projectRoot ||
        session.waveform.projectRoot === current.root
        ? session.waveform
        : null,
    );
    const restoredFiles = await restoreOpenFiles(session.openFiles, current.files);
    options.setOpenFiles(restoredFiles);
    options.setActiveFilePath(
      restoredFiles.some((file) => file.path === session.activeFile)
        ? session.activeFile
        : restoredFiles.at(-1)?.path || null,
    );
    await restoreActiveView(session.activeView, restoredFiles, options);
    options.setStatus(`Restored ${current.name}`);
  } catch (error) {
    options.setStatus(`Session restore skipped: ${errorMessage(error)}`);
  }
}

async function restoreOpenFiles(sessionFiles: string[], projectFiles: string[]) {
  const restored: OpenFile[] = [];
  for (const path of sessionFiles.filter((file) => projectFiles.includes(file))) {
    try {
      const disk = await window.openbench.readFile(path);
      const draft = await window.openbench.loadRecoveryDraft(path);
      restored.push({
        ...disk,
        content: draft?.content ?? disk.content,
        savedContent: disk.content,
      });
    } catch {
      // A removed tab should not prevent the rest of the session from opening.
    }
  }
  return restored;
}

async function restoreActiveView(
  activeView: ActiveView,
  files: OpenFile[],
  options: SessionRestoreOptions,
) {
  if (activeView === 'waveform') {
    try {
      options.waveformWorkerRef.current?.postMessage({
        ...(await window.openbench.readLatestVcd()),
        purpose: 'open',
      });
      return;
    } catch {
      options.setActiveView(files.length ? 'source' : 'waveform');
      return;
    }
  }
  if (activeView === 'schematic') {
    try {
      const result = await window.openbench.readLatestNetlist();
      options.setNetlist(result.netlist);
      options.setRtlTop(result.top);
      options.setActiveView('schematic');
      return;
    } catch {
      options.setActiveView(files.length ? 'source' : 'schematic');
      return;
    }
  }
  options.setActiveView('source');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
