import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { editor } from 'monaco-editor';
import type { VcdData } from '../vcdParser';
import type { YosysNetlist } from '../netlistGraph';
import type { ActiveView, OpenFile, SimulationRun } from '../types/ui';
import { postWaveformRequest } from '../waveformWorkerClient';

export function useProjectSources(project: ProjectData | null) {
  const [sources, setSources] = useState<Array<{ path: string; content: string }>>([]);
  const generation = useRef(0);
  const projectRoot = project?.root ?? null;
  const projectFilesKey = project?.files.join('|') ?? '';
  useEffect(() => {
    const request = ++generation.current;
    if (!projectRoot) {
      setSources([]);
      return;
    }
    void window.rtldeck
      .readProjectSources()
      .then((files) => {
        if (generation.current === request) setSources(files);
      })
      .catch(() => {
        if (generation.current === request) setSources([]);
      });
    return () => {
      generation.current += 1;
    };
  }, [projectFilesKey, projectRoot]);
  return sources;
}

export function useWaveformHistory(
  project: ProjectData | null,
  workerRef: MutableRefObject<Worker | null>,
  projectGenerationRef: MutableRefObject<number>,
  setRuns: Dispatch<SetStateAction<SimulationRun[]>>,
  setStatus: Dispatch<SetStateAction<string>>,
) {
  const projectRoot = project?.root ?? null;
  useEffect(() => {
    if (!projectRoot) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    void window.rtldeck
      .listWaveformRuns()
      .then((runs) => {
        if (!cancelled)
          setRuns((current) => [
            ...current.filter((run) => !run.fileName),
            ...runs.map((run) => ({ ...run, files: {} })),
          ]);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.warn('RTLDeck waveform history load failed', {
          projectRoot,
          message,
        });
        setStatus(`Waveform history unavailable: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, setRuns, setStatus]);

  return useCallback(
    async (runId: string, open = false) => {
      const requestGeneration = projectGenerationRef.current;
      setRuns((current) =>
        current.map((run) => (run.id === runId ? { ...run, loading: true } : run)),
      );
      try {
        const run = await window.rtldeck.readWaveformRun(runId);
        postWaveformRequest(
          workerRef.current,
          { ...run, purpose: open ? 'open' : 'history', id: runId },
          requestGeneration,
        );
      } catch (error) {
        setRuns((current) =>
          current.map((run) => (run.id === runId ? { ...run, loading: false } : run)),
        );
        throw error;
      }
    },
    [projectGenerationRef, setRuns, workerRef],
  );
}

type OpenPathOptions = {
  editorCursor: { path: string; line: number; column: number } | null;
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>;
  openFilesRef: MutableRefObject<OpenFile[]>;
  setActiveFilePath: Dispatch<SetStateAction<string | null>>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useOpenPath(options: OpenPathOptions) {
  const {
    editorCursor,
    editorRef,
    openFilesRef,
    setActiveFilePath,
    setActiveView,
    setOpenFiles,
    setStatus,
  } = options;
  return useCallback(
    async (path: string, line?: number, column = 1) => {
      try {
        let recovered = false;
        if (!openFilesRef.current.some((item) => item.path === path)) {
          const file = await window.rtldeck.readFile(path);
          const draft = await window.rtldeck.loadRecoveryDraft(path);
          recovered = Boolean(draft && draft.content !== file.content);
          setOpenFiles((current) => [
            ...current,
            { ...file, content: draft?.content ?? file.content, savedContent: file.content },
          ]);
        }
        setActiveFilePath(path);
        setActiveView('source');
        setStatus(recovered ? `Recovered unsaved changes in ${path}` : path);
        revealEditorLocation(path, line, column, editorCursor, editorRef);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [
      editorCursor,
      editorRef,
      openFilesRef,
      setActiveFilePath,
      setActiveView,
      setOpenFiles,
      setStatus,
    ],
  );
}

function revealEditorLocation(
  path: string,
  line: number | undefined,
  column: number,
  editorCursor: OpenPathOptions['editorCursor'],
  editorRef: OpenPathOptions['editorRef'],
) {
  requestAnimationFrame(() => {
    const location = line ? { line, column } : editorCursor?.path === path ? editorCursor : null;
    if (!location || !editorRef.current) return;
    editorRef.current.setPosition({ lineNumber: location.line, column: location.column });
    editorRef.current.revealLineInCenter(location.line);
    editorRef.current.focus();
  });
}

type LoadProjectOptions = {
  projectGenerationRef: MutableRefObject<number>;
  setActiveFilePath: Dispatch<SetStateAction<string | null>>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setBreakpoints: Dispatch<SetStateAction<WaveBreakpoint[]>>;
  setCompilePassed: Dispatch<SetStateAction<boolean>>;
  setConsoleText: Dispatch<SetStateAction<string>>;
  setHasRunSimulation: Dispatch<SetStateAction<boolean>>;
  setNetlist: Dispatch<SetStateAction<YosysNetlist | null>>;
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>;
  setProject: Dispatch<SetStateAction<ProjectData | null>>;
  setRtlTop: Dispatch<SetStateAction<string | null>>;
  setSettings: Dispatch<SetStateAction<ProjectSettings>>;
  setSimulationRuns: Dispatch<SetStateAction<SimulationRun[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setWaveform: Dispatch<SetStateAction<VcdData | null>>;
  setWaveformName: Dispatch<SetStateAction<string | null>>;
  setWaveformSession: Dispatch<SetStateAction<WaveformSession | null>>;
};

export function useLoadProject(options: LoadProjectOptions) {
  const {
    projectGenerationRef,
    setActiveFilePath,
    setActiveView,
    setBreakpoints,
    setCompilePassed,
    setConsoleText,
    setHasRunSimulation,
    setNetlist,
    setOpenFiles,
    setProject,
    setRtlTop,
    setSettings,
    setSimulationRuns,
    setStatus,
    setWaveform,
    setWaveformName,
    setWaveformSession,
  } = options;
  return useCallback(
    async (next: ProjectData, resetWorkspace = true) => {
      projectGenerationRef.current += 1;
      setProject(next);
      if (resetWorkspace)
        resetWorkspaceState({
          setActiveFilePath,
          setActiveView,
          setBreakpoints,
          setCompilePassed,
          setHasRunSimulation,
          setNetlist,
          setOpenFiles,
          setRtlTop,
          setSimulationRuns,
          setWaveform,
          setWaveformName,
          setWaveformSession,
        });
      setConsoleText(`Opened ${next.root}\n`);
      setStatus(`${next.files.length} project files`);
      setSettings(await window.rtldeck.getSettings());
    },
    [
      projectGenerationRef,
      setActiveFilePath,
      setActiveView,
      setBreakpoints,
      setCompilePassed,
      setConsoleText,
      setHasRunSimulation,
      setNetlist,
      setOpenFiles,
      setProject,
      setRtlTop,
      setSettings,
      setSimulationRuns,
      setStatus,
      setWaveform,
      setWaveformName,
      setWaveformSession,
    ],
  );
}

type WorkspaceResetOptions = Omit<
  LoadProjectOptions,
  'projectGenerationRef' | 'setConsoleText' | 'setProject' | 'setSettings' | 'setStatus'
>;

function resetWorkspaceState(options: WorkspaceResetOptions) {
  options.setOpenFiles([]);
  options.setActiveFilePath(null);
  options.setWaveform(null);
  options.setWaveformName(null);
  options.setSimulationRuns([]);
  options.setNetlist(null);
  options.setRtlTop(null);
  options.setBreakpoints([]);
  options.setHasRunSimulation(false);
  options.setCompilePassed(false);
  options.setWaveformSession(null);
  options.setActiveView('source');
}
