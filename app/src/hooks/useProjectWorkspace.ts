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

export function useProjectSources(project: ProjectData | null) {
  const [sources, setSources] = useState<Array<{ path: string; content: string }>>([]);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    if (!project) {
      setSources([]);
      return;
    }
    void window.openbench
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
  }, [project?.root, project?.files.join('|')]);
  return sources;
}

export function useWaveformHistory(
  project: ProjectData | null,
  workerRef: MutableRefObject<Worker | null>,
  setRuns: Dispatch<SetStateAction<SimulationRun[]>>,
  setStatus: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!project) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    void window.openbench
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
        console.warn('OpenBench waveform history load failed', {
          projectRoot: project.root,
          message,
        });
        setStatus(`Waveform history unavailable: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.root]);

  return useCallback(
    async (runId: string) => {
      setRuns((current) =>
        current.map((run) => (run.id === runId ? { ...run, loading: true } : run)),
      );
      try {
        const run = await window.openbench.readWaveformRun(runId);
        workerRef.current?.postMessage({
          ...run,
          purpose: 'history',
          id: runId,
        });
      } catch (error) {
        setRuns((current) =>
          current.map((run) => (run.id === runId ? { ...run, loading: false } : run)),
        );
        throw error;
      }
    },
    [project?.root],
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
  return useCallback(
    async (path: string, line?: number, column = 1) => {
      try {
        let recovered = false;
        if (!options.openFilesRef.current.some((item) => item.path === path)) {
          const file = await window.openbench.readFile(path);
          const draft = await window.openbench.loadRecoveryDraft(path);
          recovered = Boolean(draft && draft.content !== file.content);
          options.setOpenFiles((current) => [
            ...current,
            { ...file, content: draft?.content ?? file.content, savedContent: file.content },
          ]);
        }
        options.setActiveFilePath(path);
        options.setActiveView('source');
        options.setStatus(recovered ? `Recovered unsaved changes in ${path}` : path);
        revealEditorLocation(path, line, column, options);
      } catch (error) {
        options.setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [options.editorCursor],
  );
}

function revealEditorLocation(
  path: string,
  line: number | undefined,
  column: number,
  options: OpenPathOptions,
) {
  requestAnimationFrame(() => {
    const location = line
      ? { line, column }
      : options.editorCursor?.path === path
        ? options.editorCursor
        : null;
    if (!location || !options.editorRef.current) return;
    options.editorRef.current.setPosition({ lineNumber: location.line, column: location.column });
    options.editorRef.current.revealLineInCenter(location.line);
    options.editorRef.current.focus();
  });
}

type LoadProjectOptions = {
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
  return useCallback(async (next: ProjectData, resetWorkspace = true) => {
    options.setProject(next);
    if (resetWorkspace) resetWorkspaceState(options);
    options.setConsoleText(`Opened ${next.root}\n`);
    options.setStatus(`${next.files.length} project files`);
    options.setSettings(await window.openbench.getSettings());
  }, []);
}

function resetWorkspaceState(options: LoadProjectOptions) {
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
