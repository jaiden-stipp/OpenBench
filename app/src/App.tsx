import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as localMonaco from 'monaco-editor';
import type { editor } from 'monaco-editor';
import { parseDiagnostic } from './diagnostics.js';
import WaveformPanel from './WaveformPanel';
import type { VcdData } from './vcdParser.js';
import type { VcdSignal } from './vcdParser.js';
import SchematicPanel from './SchematicPanel';
import { sourceForNet } from './netlistGraph.js';
import type { YosysNetlist } from './netlistGraph.js';
import { parseYosysSource } from './sourceLocation.js';
import SettingsDialog from './SettingsDialog';
import HelpDialog from './HelpDialog';
import AppMenu from './AppMenu';
import {
  ImportProjectDialog,
  NewProjectDialog,
  StimulusDialog,
  TextPromptDialog,
} from './ProjectDialogs';
import openBenchLogo from './assets/openbench-logo.png';
import OnboardingDialog from './OnboardingDialog';
import GuidanceCenter from './GuidanceCenter';
import { analyzeProjectSources, explainWaveform } from './projectInsights.js';
import OutputConsole from './components/OutputConsole';
import ProjectExplorer from './components/ProjectExplorer';
import RunToolbar from './components/RunToolbar';
import AboutDialog from './components/AboutDialog';
import ProjectContextMenu from './components/ProjectContextMenu';
import { FileTabs, ViewTabs } from './components/WorkspaceTabs';
import {
  conceptForLine,
  configureSystemVerilog,
  defaultSourceConcept,
} from './editor/systemVerilog';
import type {
  AccessibilityPreferences,
  ActiveView,
  ConsoleMode,
  ContextMenuState,
  OpenFile,
  PromptState,
  SimulationRun,
  SourceConcept,
  Theme,
} from './types/ui';

loader.config({ monaco: localMonaco });
export default function App() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [consoleText, setConsoleText] = useState('Open an HDL project to begin.');
  const [compiling, setCompiling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [rtlRunning, setRtlRunning] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('source');
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('compile');
  const [waveform, setWaveform] = useState<VcdData | null>(null);
  const [waveformName, setWaveformName] = useState<string | null>(null);
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[]>([]);
  const [waveformProbe, setWaveformProbe] = useState<string | null>(null);
  const [schematicProbe, setSchematicProbe] = useState<string | null>(null);
  const [breakpoints, setBreakpoints] = useState<WaveBreakpoint[]>([]);
  const [netlist, setNetlist] = useState<YosysNetlist | null>(null);
  const [rtlTop, setRtlTop] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>({
    topModule: '',
    simulationTop: '',
    includePaths: [],
    simulator: 'iverilog',
    toolchainPath: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showTutorial, setShowTutorial] = useState(
    () => localStorage.getItem('openbench.tutorialComplete') !== 'true',
  );
  const [importSelection, setImportSelection] = useState<ProjectSelection | null>(null);
  const [newProjectParent, setNewProjectParent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sourceConcept, setSourceConcept] = useState<SourceConcept | null>(null);
  const [watchMode, setWatchMode] = useState(false);
  const [hasRunSimulation, setHasRunSimulation] = useState(false);
  const [compilePassed, setCompilePassed] = useState(false);
  const [projectSources, setProjectSources] = useState<Array<{ path: string; content: string }>>(
    [],
  );
  const [schematicModuleFocus, setSchematicModuleFocus] = useState<string | null>(null);
  const [stimulusModule, setStimulusModule] = useState<string | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(() => {
    const defaults = { highContrast: false, largeText: false, reduceMotion: false };
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem('openbench.accessibility') || '{}'),
      };
    } catch {
      return defaults;
    }
  });
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('rtlbench.theme') === 'light' ? 'light' : 'dark',
  );
  const [explorerWidth, setExplorerWidth] = useState(248);
  const [consoleHeight, setConsoleHeight] = useState(220);
  const [consoleWidth, setConsoleWidth] = useState(340);
  const [explorerDock, setExplorerDock] = useState<'left' | 'right'>(() =>
    localStorage.getItem('rtlbench.explorerDock') === 'right' ? 'right' : 'left',
  );
  const [consoleDock, setConsoleDock] = useState<'bottom' | 'right'>(() =>
    localStorage.getItem('rtlbench.consoleDock') === 'right' ? 'right' : 'bottom',
  );
  const [status, setStatus] = useState('Ready');
  const [waveformSession, setWaveformSession] = useState<WaveformSession | null>(null);
  const [editorCursor, setEditorCursor] = useState<{
    path: string;
    line: number;
    column: number;
  } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [lintStatus, setLintStatus] = useState<'idle' | 'checking' | 'clean' | 'issues'>('idle');
  const openFile = openFiles.find((file) => file.path === activeFilePath) || null;
  const updateOpenFile = useCallback(
    (updater: (file: OpenFile) => OpenFile) => {
      if (!activeFilePath) return;
      setOpenFiles((current) =>
        current.map((file) => (file.path === activeFilePath ? updater(file) : file)),
      );
    },
    [activeFilePath],
  );
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const waveformWorkerRef = useRef<Worker | null>(null);
  const pendingBreakpointHitRef = useRef<{ condition: string; time: number } | null>(null);
  const pendingRunSourcesRef = useRef<Record<string, string>>({});
  const watchRunRef = useRef<(() => Promise<void>) | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{
    kind: 'explorer' | 'consoleHeight' | 'consoleWidth';
    start: number;
    size: number;
    direction: 1 | -1;
  } | null>(null);
  const lintRequestRef = useRef(0);
  const activeFilePathRef = useRef<string | null>(null);
  const openFilesRef = useRef<OpenFile[]>([]);

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  useEffect(() => {
    let cancelled = false;
    if (!project) {
      setProjectSources([]);
      return;
    }
    void Promise.all(
      project.files.map((file) => window.rtlbench.readFile(file).catch(() => null)),
    ).then((files) => {
      if (!cancelled)
        setProjectSources(
          files.filter((file): file is { path: string; content: string } => Boolean(file)),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [project?.root, project?.files.join('|')]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void window.rtlbench
      .listWaveformRuns()
      .then((runs) => {
        if (!cancelled)
          runs.forEach((run) =>
            waveformWorkerRef.current?.postMessage({
              name: run.fileName,
              content: run.content,
              purpose: 'history',
              id: run.id,
              createdAt: run.createdAt,
            }),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project?.root]);

  useEffect(() => {
    localStorage.setItem('openbench.accessibility', JSON.stringify(accessibility));
    document.body.classList.toggle('high-contrast', accessibility.highContrast);
    document.body.classList.toggle('large-interface-text', accessibility.largeText);
    document.body.classList.toggle('reduce-motion', accessibility.reduceMotion);
  }, [accessibility]);

  const projectInsights = useMemo(
    () => analyzeProjectSources(projectSources, settings),
    [projectSources, settings],
  );
  const waveformInsights = useMemo(() => explainWaveform(waveform), [waveform]);

  useEffect(() => {
    const worker = new Worker(new URL('./vcd.worker.ts', import.meta.url), { type: 'module' });
    waveformWorkerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        name?: string;
        data?: VcdData;
        error?: string;
        purpose?: 'history';
        id?: string;
        createdAt?: number;
      }>,
    ) => {
      if (event.data.ok && event.data.data) {
        if (event.data.purpose === 'history') {
          setSimulationRuns((current) =>
            current.some((run) => run.id === event.data.id)
              ? current
              : [
                  ...current,
                  {
                    id: event.data.id || `saved-${event.data.createdAt}`,
                    name: `Saved · ${event.data.name || 'waveform'}`,
                    createdAt: event.data.createdAt || Date.now(),
                    data: event.data.data!,
                    files: {},
                  },
                ]
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .slice(0, 6),
          );
          return;
        }
        setWaveform(event.data.data);
        setWaveformName(event.data.name ?? 'simulation.vcd');
        setSimulationRuns((current) => {
          const files = pendingRunSourcesRef.current;
          const previous = current[0]?.files || {};
          const changed = Object.keys(files).filter(
            (file) => previous[file] !== files[file],
          ).length;
          return [
            {
              id: `${Date.now()}`,
              name: `Run ${current.length + 1}${current.length ? ` · ${changed} file${changed === 1 ? '' : 's'} changed` : ''}`,
              createdAt: Date.now(),
              data: event.data.data!,
              files,
            },
            ...current,
          ].slice(0, 6);
        });
        setActiveView('waveform');
        const hit = pendingBreakpointHitRef.current;
        pendingBreakpointHitRef.current = null;
        setStatus(
          hit
            ? `Stopped at ${hit.condition} (time ${hit.time})`
            : `Loaded ${event.data.data.signals.length} waveform signals`,
        );
      } else setStatus(event.data.error || 'Unable to parse VCD.');
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    localStorage.setItem('rtlbench.theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('rtlbench.explorerDock', explorerDock);
  }, [explorerDock]);
  useEffect(() => {
    localStorage.setItem('rtlbench.consoleDock', consoleDock);
  }, [consoleDock]);

  useEffect(() => {
    if (!sessionReady) return;
    const timer = setTimeout(
      () =>
        void window.rtlbench.saveSession({
          projectRoot: project?.root || '',
          openFiles: openFiles.map((file) => file.path),
          activeFile: activeFilePath || '',
          activeView,
          editorCursor,
          waveform: waveformSession,
        }),
      250,
    );
    return () => clearTimeout(timer);
  }, [
    activeFilePath,
    activeView,
    editorCursor,
    openFiles,
    project?.root,
    sessionReady,
    waveformSession,
  ]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const coordinate = resize.kind === 'consoleHeight' ? event.clientY : event.clientX;
      const next = resize.size + (coordinate - resize.start) * resize.direction;
      if (resize.kind === 'explorer') setExplorerWidth(Math.max(170, Math.min(480, next)));
      else if (resize.kind === 'consoleHeight')
        setConsoleHeight(Math.max(120, Math.min(480, next)));
      else setConsoleWidth(Math.max(240, Math.min(620, next)));
    };
    const stop = () => {
      resizeRef.current = null;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  useEffect(
    () =>
      window.rtlbench.onCompileEvent((event) => {
        if (event.type === 'start') {
          setCompiling(true);
          setConsoleMode('compile');
          setConsoleText(`$ ${event.command}\n`);
          setStatus('Compiling');
        } else if (event.type === 'output') {
          setConsoleText((value) => value + event.text);
        } else {
          setCompiling(false);
          setCompilePassed(event.code === 0);
          if (event.code !== 0) setShowGuidance(true);
          setConsoleText((value) => `${value}\nCompile finished with exit code ${event.code}.\n`);
          setStatus(event.code === 0 ? 'Compile passed' : 'Compile failed');
        }
      }),
    [],
  );

  useEffect(
    () =>
      window.rtlbench.onSimulationEvent((event) => {
        if (event.type === 'start') {
          setSimulating(true);
          setConsoleMode('simulation');
          setConsoleText(
            `Starting real ${event.backend === 'verilator' ? 'Verilator' : 'Icarus'} simulation…\n`,
          );
          setStatus('Simulating');
        } else if (event.type === 'output') {
          setConsoleText((value) => value + event.text);
        } else {
          setSimulating(false);
          if (event.code !== 0) setShowGuidance(true);
          setConsoleText(
            (value) => `${value}\nSimulation finished with exit code ${event.code}.\n`,
          );
          setStatus(
            event.code === 0
              ? event.breakpointHit
                ? `Stopped at ${event.breakpointHit.condition} (time ${event.breakpointHit.time})`
                : `Simulation passed: ${event.vcdPath}`
              : 'Simulation failed',
          );
        }
      }),
    [],
  );

  useEffect(
    () =>
      window.rtlbench.onRtlEvent((event) => {
        if (event.type === 'start') {
          setRtlRunning(true);
          setConsoleMode('rtl');
          setConsoleText('Starting real Yosys elaboration…\n');
          setStatus('Elaborating RTL');
        } else if (event.type === 'output') {
          setConsoleText((value) => value + event.text);
        } else {
          setRtlRunning(false);
          setConsoleText((value) => `${value}\nYosys finished with exit code ${event.code}.\n`);
          setStatus(
            event.code === 0
              ? `RTL ready: ${event.top} (${event.moduleCount} modules)`
              : 'RTL elaboration failed',
          );
        }
      }),
    [],
  );

  const openPath = useCallback(
    async (relativePath: string, line?: number, column = 1) => {
      try {
        const existing = openFilesRef.current.find((item) => item.path === relativePath);
        let recovered = false;
        if (!existing) {
          const file = await window.rtlbench.readFile(relativePath);
          const draft = await window.rtlbench.loadRecoveryDraft(relativePath);
          recovered = Boolean(draft && draft.content !== file.content);
          const opened = {
            ...file,
            content: draft?.content ?? file.content,
            savedContent: file.content,
          };
          setOpenFiles((current) => [...current, opened]);
        }
        setActiveFilePath(relativePath);
        setActiveView('source');
        setStatus(recovered ? `Recovered unsaved changes in ${relativePath}` : relativePath);
        requestAnimationFrame(() => {
          const restore = line
            ? { line, column }
            : editorCursor?.path === relativePath
              ? editorCursor
              : null;
          if (restore && editorRef.current) {
            editorRef.current.setPosition({ lineNumber: restore.line, column: restore.column });
            editorRef.current.revealLineInCenter(restore.line);
            editorRef.current.focus();
          }
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [editorCursor],
  );

  const loadProject = useCallback(async (next: ProjectData, resetWorkspace = true) => {
    setProject(next);
    if (resetWorkspace) {
      setOpenFiles([]);
      setActiveFilePath(null);
      setWaveform(null);
      setWaveformName(null);
      setSimulationRuns([]);
      setNetlist(null);
      setRtlTop(null);
      setBreakpoints([]);
      setHasRunSimulation(false);
      setCompilePassed(false);
      setWaveformSession(null);
      setActiveView('source');
    }
    setConsoleText(`Opened ${next.root}\n`);
    setStatus(`${next.files.length} project files`);
    setSettings(await window.rtlbench.getSettings());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await window.rtlbench.loadSession();
        const current = session.projectRoot
          ? await window.rtlbench.restoreProject(session.projectRoot)
          : await window.rtlbench.getActiveProject();
        if (!current || cancelled) {
          setSessionReady(true);
          return;
        }
        await loadProject(current, false);
        if (cancelled) return;
        setEditorCursor(session.editorCursor);
        setWaveformSession(session.waveform);
        const restoredFiles: OpenFile[] = [];
        for (const relativePath of session.openFiles.filter((file) =>
          current.files.includes(file),
        )) {
          try {
            const disk = await window.rtlbench.readFile(relativePath);
            const draft = await window.rtlbench.loadRecoveryDraft(relativePath);
            restoredFiles.push({
              ...disk,
              content: draft?.content ?? disk.content,
              savedContent: disk.content,
            });
          } catch {
            /* A removed tab should not prevent the rest of the session from opening. */
          }
        }
        setOpenFiles(restoredFiles);
        setActiveFilePath(
          restoredFiles.some((file) => file.path === session.activeFile)
            ? session.activeFile
            : restoredFiles.at(-1)?.path || null,
        );
        if (session.activeView === 'waveform') {
          try {
            waveformWorkerRef.current?.postMessage(await window.rtlbench.readLatestVcd());
          } catch {
            setActiveView(restoredFiles.length ? 'source' : 'waveform');
          }
        } else if (session.activeView === 'schematic') {
          try {
            const result = await window.rtlbench.readLatestNetlist();
            setNetlist(result.netlist);
            setRtlTop(result.top);
            setActiveView('schematic');
          } catch {
            setActiveView(restoredFiles.length ? 'source' : 'schematic');
          }
        } else setActiveView('source');
        setStatus(`Restored ${current.name}`);
      } catch (error) {
        setStatus(
          `Session restore skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject]);

  const openProject = async () => {
    try {
      const selection = await window.rtlbench.selectProjectFolder();
      if (selection) setImportSelection(selection);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const activateSelection = async (name: string, files: string[]) => {
    if (!importSelection) return;
    try {
      const next = await window.rtlbench.activateProject({
        root: importSelection.root,
        name,
        files,
        suggestedTop: importSelection.suggestedTop,
        suggestedSimulationTop: importSelection.suggestedSimulationTop,
      });
      setImportSelection(null);
      await loadProject(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const beginNewProject = async () => {
    try {
      const parent = await window.rtlbench.chooseNewProjectParent();
      if (parent) setNewProjectParent(parent);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const completeTutorial = () => {
    localStorage.setItem('openbench.tutorialComplete', 'true');
    setShowTutorial(false);
  };
  const openExampleProject = async (keepTutorial = false, lessonId = 'getting-started') => {
    try {
      if (!keepTutorial) completeTutorial();
      const next = await window.rtlbench.openExampleProject(lessonId);
      await loadProject(next);
      await openPath('getting_started_counter.sv');
      setStatus('Example ready: press Run Simulation');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      if (keepTutorial) throw error;
    }
  };

  const openLearningProject = async (lessonId: string) => {
    const next = await window.rtlbench.openExampleProject(lessonId);
    await loadProject(next);
    const design =
      next.files.find((file) => !/(?:^|[_.-])(?:tb|testbench)(?:[_.-]|$)/i.test(file)) ||
      next.files[0];
    if (design) await openPath(design);
    setShowGuidance(false);
    setStatus(`${next.name} lesson ready: compile, simulate, and inspect the waveform`);
  };

  const createNewProject = async (name: string, withStarter: boolean) => {
    if (!newProjectParent) return;
    try {
      const next = await window.rtlbench.createProject({
        parent: newProjectParent,
        name,
        withStarter,
      });
      setNewProjectParent(null);
      await loadProject(next);
      const design =
        next.files.find((file) => !/(^|[_.-])(tb|testbench)([_.-]|$)/i.test(file)) || next.files[0];
      if (design) await openPath(design);
      setStatus(
        withStarter
          ? 'Ready: press Run Simulation to see the starter waveform'
          : 'Empty project created; add an HDL file',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const refreshProject = useCallback(async () => {
    const next = await window.rtlbench.refreshProject();
    setProject(next);
    return next;
  }, []);

  const addProjectFiles = async () => {
    try {
      const added = await window.rtlbench.addProjectFiles();
      if (added.length) {
        await refreshProject();
        await openPath(added[0]);
        setStatus(`Added ${added.length} file${added.length === 1 ? '' : 's'}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const submitPrompt = async (value: string) => {
    if (!prompt) return;
    try {
      if (prompt.kind === 'new-file') {
        const base = prompt.node?.kind === 'directory' ? prompt.node.path : '';
        const relative = base ? `${base}/${value}` : value;
        const created = await window.rtlbench.createFile(relative, `// ${value}\n`);
        setPrompt(null);
        await refreshProject();
        await openPath(created);
      } else if (prompt.kind === 'new-folder') {
        const base = prompt.node?.kind === 'directory' ? prompt.node.path : '';
        const relative = base ? `${base}/${value}` : value;
        const created = await window.rtlbench.createFolder(relative);
        setPrompt(null);
        await refreshProject();
        setStatus(`Created folder ${created}`);
      } else if (prompt.node) {
        const oldPath = prompt.node.path;
        const renamed = await window.rtlbench.renameEntry(oldPath, value);
        setPrompt(null);
        await refreshProject();
        setOpenFiles((current) =>
          current.map((file) =>
            file.path === oldPath || file.path.startsWith(`${oldPath}/`)
              ? { ...file, path: `${renamed}${file.path.slice(oldPath.length)}` }
              : file,
          ),
        );
        if (
          activeFilePath &&
          (activeFilePath === oldPath || activeFilePath.startsWith(`${oldPath}/`))
        )
          setActiveFilePath(`${renamed}${activeFilePath.slice(oldPath.length)}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const removeProjectEntry = async (node: ProjectNode) => {
    try {
      const removed = await window.rtlbench.removeEntry(node.path);
      if (removed) {
        const remaining = openFiles.filter(
          (file) => file.path !== node.path && !file.path.startsWith(`${node.path}/`),
        );
        setOpenFiles(remaining);
        if (activeFilePath === node.path || activeFilePath?.startsWith(`${node.path}/`))
          setActiveFilePath(remaining.at(-1)?.path || null);
        await refreshProject();
        setStatus(`Moved ${node.name} to the Recycle Bin`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
    setContextMenu(null);
  };

  const save = useCallback(
    async (triggerWatch = true) => {
      if (!openFile) return;
      try {
        await window.rtlbench.writeFile(openFile.path, openFile.content);
        updateOpenFile((file) => ({ ...file, savedContent: file.content }));
        await window.rtlbench.clearRecoveryDraft(openFile.path);
        if (triggerWatch && watchMode && hasRunSimulation) {
          if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
          watchTimerRef.current = setTimeout(() => void watchRunRef.current?.(), 450);
          setStatus(`Saved ${openFile.path}; watch rerun scheduled`);
        } else setStatus(`Saved ${openFile.path}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [hasRunSimulation, openFile, updateOpenFile, watchMode],
  );

  const runInlineLint = useCallback(async (filePath: string) => {
    const request = ++lintRequestRef.current;
    setLintStatus('checking');
    try {
      const result = await window.rtlbench.runInlineLint();
      if (request !== lintRequestRef.current || result.skipped) return;
      const normalizedPath = filePath.replaceAll('\\', '/').toLowerCase();
      const diagnostics = result.output
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
      const model = localMonaco.editor
        .getModels()
        .find((item) =>
          item.uri.path
            .replace(/^\//, '')
            .replaceAll('\\', '/')
            .toLowerCase()
            .endsWith(normalizedPath),
        );
      if (model) localMonaco.editor.setModelMarkers(model, 'openbench-inline-lint', diagnostics);
      setLintStatus(diagnostics.length || result.code !== 0 ? 'issues' : 'clean');
    } catch {
      if (request === lintRequestRef.current) setLintStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (!project || !openFile || openFile.content === openFile.savedContent) return;
    const pathAtEdit = openFile.path;
    const contentAtEdit = openFile.content;
    const recoveryTimer = setTimeout(
      () => void window.rtlbench.saveRecoveryDraft(pathAtEdit, contentAtEdit),
      120,
    );
    const autosaveTimer = setTimeout(
      () =>
        void (async () => {
          try {
            await window.rtlbench.writeFile(pathAtEdit, contentAtEdit);
            setOpenFiles((current) =>
              current.map((file) =>
                file.path === pathAtEdit && file.content === contentAtEdit
                  ? { ...file, savedContent: contentAtEdit }
                  : file,
              ),
            );
            await window.rtlbench.clearRecoveryDraft(pathAtEdit);
            setStatus(`Autosaved ${pathAtEdit}`);
            await runInlineLint(pathAtEdit);
          } catch (error) {
            setStatus(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        })(),
      900,
    );
    return () => {
      clearTimeout(recoveryTimer);
      clearTimeout(autosaveTimer);
    };
  }, [openFile, project, runInlineLint]);

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

  const runCompile = async () => {
    try {
      await window.rtlbench.runCompile();
    } catch (error) {
      setCompiling(false);
      const message = error instanceof Error ? error.message : String(error);
      setConsoleText((value) => `${value}\n${message}\n`);
      setStatus(message);
    }
  };

  const runSimulation = async () => {
    try {
      if (openFile && openFile.content !== openFile.savedContent) await save(false);
      pendingRunSourcesRef.current = Object.fromEntries([
        ...projectSources.map((file) => [file.path, file.content] as const),
        ...openFiles.map((file) => [file.path, file.content] as const),
      ]);
      const result = await window.rtlbench.runSimulation(breakpoints);
      pendingBreakpointHitRef.current = result.breakpointHit || null;
      setHasRunSimulation(true);
      setStatus('Parsing VCD off the UI thread');
      const vcd = await window.rtlbench.readLatestVcd();
      waveformWorkerRef.current?.postMessage(vcd);
    } catch (error) {
      setSimulating(false);
      setShowGuidance(true);
      const message = error instanceof Error ? error.message : String(error);
      setConsoleText((value) => `${value}\n${message}\n`);
      setStatus(message);
    }
  };

  const runRtl = async () => {
    try {
      if (openFile && openFile.content !== openFile.savedContent) await save(false);
      await window.rtlbench.runRtl();
      const result = await window.rtlbench.readLatestNetlist();
      setNetlist(result.netlist);
      setRtlTop(result.top);
      setActiveView('schematic');
      setStatus(`ELK layout for ${result.top}`);
    } catch (error) {
      setRtlRunning(false);
      const message = error instanceof Error ? error.message : String(error);
      setConsoleText((value) => `${value}\n${message}\n`);
      setStatus(message);
    }
  };
  watchRunRef.current = runSimulation;

  const navigateYosysSource = useCallback(
    (source: string) => {
      if (!project) return;
      const location = parseYosysSource(source, project.root);
      if (location) void openPath(location.path, location.line, location.column);
      else setStatus(`No source location for ${source}`);
    },
    [openPath, project],
  );

  const navigateWaveSignal = useCallback(
    (signal: VcdSignal) => {
      const cleanName = signal.name.replace(/\s*\[[^\]]+\]\s*$/, '');
      setSchematicProbe(cleanName);
      const source = netlist ? sourceForNet(netlist, signal.path) : null;
      if (source) navigateYosysSource(source);
      else setStatus(`No Yosys declaration found for ${signal.path}. Run RTL Analysis first.`);
    },
    [navigateYosysSource, netlist],
  );

  const generateTestbench = async (
    moduleName: string,
    options?: {
      clockPeriod: number;
      resetDuration: number;
      finishTime: number;
      steps: Array<{ time: number; signal: string; value: string }>;
    },
  ) => {
    try {
      const generated = await window.rtlbench.generateTestbench(moduleName, options);
      setProject(await window.rtlbench.refreshProject());
      await openPath(generated.path);
      const found = [
        ...generated.detected.clocks.map((name) => `clock ${name}`),
        ...generated.detected.resets.map((name) => `reset ${name}`),
      ].join(', ');
      setStatus(`Created ${generated.path}${found ? `; detected ${found}` : ''}`);
      setConsoleText(
        (value) =>
          `${value}\nCreated editable starter testbench ${generated.path} from real Yosys port metadata.\n`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void beginNewProject();
      } else if (modifier && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openProject();
      } else if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (project) setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' });
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (project && !compiling && !simulating && !rtlRunning) void runCompile();
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (project && !compiling && !simulating && !rtlRunning) void runRtl();
      } else if (event.key === 'F5') {
        event.preventDefault();
        if (project && !compiling && !simulating && !rtlRunning) void runSimulation();
      } else if (
        activeView === 'waveform' &&
        modifier &&
        (event.key === '+' || event.key === '=')
      ) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 0.5 }));
      } else if (activeView === 'waveform' && modifier && event.key === '-') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 2 }));
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [activeView, compiling, project, rtlRunning, simulating, runRtl, runSimulation]);

  const onEditorMount: OnMount = (instance) => {
    editorRef.current = instance;
    instance.onDidChangeCursorPosition((event) => {
      const line = instance.getModel()?.getLineContent(event.position.lineNumber) || '';
      setSourceConcept(conceptForLine(line));
      if (activeFilePathRef.current)
        setEditorCursor({
          path: activeFilePathRef.current,
          line: event.position.lineNumber,
          column: event.position.column,
        });
    });
    if (editorCursor?.path === activeFilePath) {
      instance.setPosition({ lineNumber: editorCursor.line, column: editorCursor.column });
      instance.revealLineInCenter(editorCursor.line);
    }
  };

  useEffect(() => {
    const insertText = (event: Event) => {
      updateOpenFile((file) => ({
        ...file,
        content: `${file.content}${(event as CustomEvent<string>).detail}`,
      }));
    };
    window.addEventListener('rtlbench:insert-editor-text', insertText);
    const showConcept = (event: Event) => {
      const instance = editorRef.current;
      if (!instance) return;
      const detail = (event as CustomEvent<{ line: number; column: number }>).detail;
      instance.setPosition({ lineNumber: detail.line, column: detail.column });
      setSourceConcept(
        conceptForLine(instance.getModel()?.getLineContent(detail.line) || '') ||
          defaultSourceConcept(),
      );
      instance.focus();
      void instance.getAction('editor.action.showHover')?.run();
    };
    window.addEventListener('rtlbench:show-concept', showConcept);
    const showNewProject = (event: Event) =>
      setNewProjectParent((event as CustomEvent<string>).detail);
    const showImport = (event: Event) =>
      setImportSelection((event as CustomEvent<ProjectSelection>).detail);
    window.addEventListener('openbench:show-new-project', showNewProject);
    window.addEventListener('openbench:show-import', showImport);
    return () => {
      window.removeEventListener('rtlbench:insert-editor-text', insertText);
      window.removeEventListener('rtlbench:show-concept', showConcept);
      window.removeEventListener('openbench:show-new-project', showNewProject);
      window.removeEventListener('openbench:show-import', showImport);
    };
  }, [updateOpenFile]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  const composeFeedbackEmail = async (kind: 'feedback' | 'bug') => {
    try {
      await window.rtlbench.composeFeedbackEmail(kind, settings.simulator);
      setStatus(
        kind === 'bug'
          ? 'Opened bug report in your email app'
          : 'Opened feedback in your email app',
      );
    } catch (error) {
      setStatus(
        `Could not open your email app: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const closeFileTab = async (file: OpenFile) => {
    if (file.content !== file.savedContent) {
      await window.rtlbench.writeFile(file.path, file.content);
      await window.rtlbench.clearRecoveryDraft(file.path);
    }

    const remaining = openFiles.filter((item) => item.path !== file.path);
    setOpenFiles(remaining);
    if (activeFilePath === file.path) {
      setActiveFilePath(remaining.at(-1)?.path || null);
    }
  };

  const duplicateProjectFile = async (node: ProjectNode) => {
    try {
      const copy = await window.rtlbench.duplicateFile(node.path);
      await refreshProject();
      setContextMenu(null);
      await openPath(copy);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const menuActions: Record<string, () => void> = {
    newProject: () => void beginNewProject(),
    openProject: () => void openProject(),
    newFile: () => setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' }),
    newFolder: () => setPrompt({ kind: 'new-folder', initialValue: 'rtl' }),
    addFiles: () => void addProjectFiles(),
    save: () => void save(),
    settings: () => setShowSettings(true),
    close: () => void window.rtlbench.windowAction('close'),
    undo: () => editorRef.current?.trigger('menu', 'undo', null),
    redo: () => editorRef.current?.trigger('menu', 'redo', null),
    cut: () => editorRef.current?.trigger('menu', 'editor.action.clipboardCutAction', null),
    copy: () => editorRef.current?.trigger('menu', 'editor.action.clipboardCopyAction', null),
    paste: () => editorRef.current?.trigger('menu', 'editor.action.clipboardPasteAction', null),
    selectAll: () => editorRef.current?.trigger('menu', 'editor.action.selectAll', null),
    source: () => setActiveView('source'),
    waveform: () => setActiveView('waveform'),
    schematic: () => setActiveView('schematic'),
    zoomIn: () => window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 0.5 })),
    zoomOut: () => window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 2 })),
    theme: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
    explorerLeft: () => setExplorerDock('left'),
    explorerRight: () => setExplorerDock('right'),
    consoleBottom: () => setConsoleDock('bottom'),
    consoleRight: () => setConsoleDock('right'),
    watch: () => setWatchMode((value) => !value),
    minimize: () => void window.rtlbench.windowAction('minimize'),
    maximize: () => void window.rtlbench.windowAction('maximize'),
    tutorial: () => setShowTutorial(true),
    guidance: () => setShowGuidance(true),
    example: () => void openExampleProject(),
    help: () => setShowHelp(true),
    feedback: () => void composeFeedbackEmail('feedback'),
    reportBug: () => void composeFeedbackEmail('bug'),
    about: () => setShowAbout(true),
  };

  return (
    <div className={`app-shell ${theme}`}>
      <svg className="logo-filter-defs" aria-hidden="true" focusable="false">
        <filter id="openbench-logo-dark" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope="-6.96875" intercept="1" />
            <feFuncG type="linear" slope="-0.62420" intercept="1" />
            <feFuncB type="linear" slope="-0.57407" intercept="1" />
            <feFuncA type="identity" />
          </feComponentTransfer>
        </filter>
      </svg>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img className="theme-logo" src={openBenchLogo} alt="" />
          </span>
          <span>OpenBench</span>
          <small>PREVIEW</small>
        </div>
        <AppMenu
          hasProject={Boolean(project)}
          hasFile={Boolean(openFile)}
          hasWaveform={Boolean(waveform)}
          hasSchematic={Boolean(netlist)}
          activeView={activeView}
          watchMode={watchMode}
          theme={theme}
          explorerDock={explorerDock}
          consoleDock={consoleDock}
          actions={menuActions}
        />
        <RunToolbar
          hasProject={Boolean(project)}
          hasOpenFile={Boolean(openFile)}
          fileIsSaved={!openFile || openFile.content === openFile.savedContent}
          compiling={compiling}
          simulating={simulating}
          rtlRunning={rtlRunning}
          watchMode={watchMode}
          hasRunSimulation={hasRunSimulation}
          explorerDock={explorerDock}
          consoleDock={consoleDock}
          onSave={() => void save()}
          onCompile={() => void runCompile()}
          onSimulate={() => void runSimulation()}
          onRtl={() => void runRtl()}
          onToggleWatch={() => setWatchMode((value) => !value)}
          onOpenHealth={() => setShowGuidance(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenHelp={() => setShowHelp(true)}
          onToggleTheme={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
          onExplorerDock={setExplorerDock}
          onConsoleDock={setConsoleDock}
        />
      </header>
      <main
        className="workspace"
        style={{
          gridTemplateColumns:
            explorerDock === 'left'
              ? `${explorerWidth}px 4px minmax(0, 1fr)`
              : `minmax(0, 1fr) 4px ${explorerWidth}px`,
          gridTemplateAreas:
            explorerDock === 'left'
              ? '"explorer explorerSplitter center"'
              : '"center explorerSplitter explorer"',
        }}
      >
        <ProjectExplorer
          project={project}
          onOpenFile={(path) => void openPath(path)}
          onOpenContextMenu={(node, x, y) => setContextMenu({ node, x, y })}
          onNewFile={() => setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' })}
          onNewFolder={() => setPrompt({ kind: 'new-folder', initialValue: 'rtl' })}
          onAddFiles={() => void addProjectFiles()}
          onRefresh={() => void refreshProject()}
          onOpenExample={() => void openExampleProject()}
          onNewProject={() => void beginNewProject()}
          onOpenProject={() => void openProject()}
        />
        <div
          className="splitter vertical"
          style={{ gridArea: 'explorerSplitter' }}
          onPointerDown={(event) => {
            resizeRef.current = {
              kind: 'explorer',
              start: event.clientX,
              size: explorerWidth,
              direction: explorerDock === 'left' ? 1 : -1,
            };
            document.body.classList.add('resizing');
          }}
        />
        <section
          className={`center-column console-${consoleDock}`}
          style={
            consoleDock === 'bottom'
              ? {
                  gridArea: 'center',
                  gridTemplateRows: `minmax(280px, 1fr) 4px ${consoleHeight}px`,
                  gridTemplateAreas: '"editor" "consoleSplitter" "console"',
                }
              : {
                  gridArea: 'center',
                  gridTemplateColumns: `minmax(400px, 1fr) 4px ${consoleWidth}px`,
                  gridTemplateAreas: '"editor consoleSplitter console"',
                }
          }
        >
          <div
            className={`editor-panel panel ${activeView === 'source' && openFiles.length ? 'with-file-tabs' : ''}`}
            style={{ gridArea: 'editor' }}
          >
            <ViewTabs
              activeView={activeView}
              waveformSignalCount={waveform?.signals.length ?? null}
              rtlTop={rtlTop}
              lintStatus={lintStatus}
              onSelectView={setActiveView}
            />
            {activeView === 'source' && openFiles.length > 0 && (
              <FileTabs
                files={openFiles}
                activeFilePath={activeFilePath}
                onSelectFile={(path) => {
                  setActiveFilePath(path);
                  setActiveView('source');
                }}
                onCloseFile={(file) => void closeFileTab(file)}
              />
            )}
            {activeView === 'source' ? (
              openFile ? (
                <Editor
                  beforeMount={configureSystemVerilog}
                  onMount={onEditorMount}
                  language="systemverilog"
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  path={openFile.path}
                  value={openFile.content}
                  onChange={(content) =>
                    updateOpenFile((file) => ({
                      ...file,
                      content: content ?? '',
                    }))
                  }
                  options={{
                    minimap: { enabled: true },
                    fontSize: accessibility.largeText ? 17 : 14,
                    fontFamily: "'Cascadia Code', Consolas, monospace",
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    renderWhitespace: 'selection',
                    tabSize: 4,
                  }}
                />
              ) : (
                <div className="editor-empty">
                  <div className="chip">HDL</div>
                  <h1>Open a Verilog or SystemVerilog file</h1>
                  <p>Select a source file from the project tree.</p>
                </div>
              )
            ) : activeView === 'waveform' ? (
              <WaveformPanel
                data={waveform}
                name={waveformName}
                runs={simulationRuns}
                probeSignal={waveformProbe}
                onSignalNavigate={navigateWaveSignal}
                theme={theme}
                displayOptions={{
                  highContrast: accessibility.highContrast,
                  largeText: accessibility.largeText,
                }}
                breakpoints={breakpoints}
                onBreakpointsChange={setBreakpoints}
                breakpointSupported={settings.simulator === 'iverilog'}
                initialSession={waveformSession}
                onSessionChange={setWaveformSession}
              />
            ) : (
              <SchematicPanel
                netlist={netlist}
                top={rtlTop}
                focusModule={schematicModuleFocus}
                probeNet={schematicProbe}
                onNetProbe={(netName) => {
                  setWaveformProbe(netName);
                  if (waveform) setActiveView('waveform');
                  else
                    setStatus(
                      `Net ${netName} selected; run simulation to cross-probe its waveform.`,
                    );
                }}
                onNavigateSource={navigateYosysSource}
                onGenerateTestbench={setStimulusModule}
              />
            )}
            {activeView === 'source' && sourceConcept && (
              <aside className="source-concept-card">
                <button aria-label="Close concept" onClick={() => setSourceConcept(null)}>
                  ×
                </button>
                <strong>{sourceConcept.title}</strong>
                <span>{sourceConcept.text}</span>
              </aside>
            )}
          </div>
          <div
            className={`splitter ${consoleDock === 'bottom' ? 'horizontal' : 'vertical'}`}
            style={{ gridArea: 'consoleSplitter' }}
            onPointerDown={(event) => {
              resizeRef.current =
                consoleDock === 'bottom'
                  ? {
                      kind: 'consoleHeight',
                      start: event.clientY,
                      size: consoleHeight,
                      direction: -1,
                    }
                  : {
                      kind: 'consoleWidth',
                      start: event.clientX,
                      size: consoleWidth,
                      direction: -1,
                    };
              document.body.classList.add('resizing');
            }}
          />
          <OutputConsole
            mode={consoleMode}
            text={consoleText}
            onClear={() => setConsoleText('')}
            onOpenSource={(path, line, column) => void openPath(path, line, column)}
          />
        </section>
      </main>
      <footer>
        <span>{project?.root ?? 'No project'}</span>
        <span>
          {activeView === 'source'
            ? (openFile?.path ?? 'No file selected')
            : activeView === 'waveform'
              ? (waveformName ?? 'No waveform')
              : (rtlTop ?? 'No RTL netlist')}
        </span>
        <span className={status.toLowerCase().includes('failed') ? 'bad' : ''}>{status}</span>
      </footer>
      {showSettings && (
        <SettingsDialog
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSave={async (next) => {
            const saved = await window.rtlbench.saveSettings(next);
            setSettings(saved);
            setStatus('Project settings saved');
          }}
        />
      )}
      {showHelp && (
        <HelpDialog
          simulator={settings.simulator}
          onClose={() => setShowHelp(false)}
          onComposeEmail={(kind) => void composeFeedbackEmail(kind)}
        />
      )}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showGuidance && project && (
        <GuidanceCenter
          project={project}
          settings={settings}
          insights={projectInsights}
          waveformInsights={waveformInsights}
          netlist={netlist}
          rtlTop={rtlTop}
          consoleText={consoleText}
          accessibility={accessibility}
          onAccessibility={setAccessibility}
          onClose={() => setShowGuidance(false)}
          onSaveSettings={async (next) => {
            const saved = await window.rtlbench.saveSettings(next);
            setSettings(saved);
          }}
          onOpenModule={(name) => {
            setSchematicModuleFocus(name);
            setActiveView('schematic');
            setShowGuidance(false);
          }}
          onOpenLearningProject={openLearningProject}
        />
      )}
      {stimulusModule && netlist?.modules?.[stimulusModule] && (
        <StimulusDialog
          moduleName={stimulusModule}
          inputs={Object.entries(netlist.modules[stimulusModule].ports || {})
            .filter(([, port]: any) => port.direction === 'input')
            .map(([name]) => name)
            .filter((name) => !/^(?:clk|clock|rst|reset|rst_n|reset_n)$/i.test(name))}
          onCancel={() => setStimulusModule(null)}
          onGenerate={(options) => {
            const moduleName = stimulusModule;
            setStimulusModule(null);
            void generateTestbench(moduleName, options);
          }}
        />
      )}
      {importSelection && (
        <ImportProjectDialog
          selection={importSelection}
          onCancel={() => setImportSelection(null)}
          onConfirm={(name, files) => void activateSelection(name, files)}
        />
      )}
      {newProjectParent && (
        <NewProjectDialog
          parent={newProjectParent}
          onCancel={() => setNewProjectParent(null)}
          onCreate={(name, withStarter) => void createNewProject(name, withStarter)}
        />
      )}
      {showTutorial && (
        <OnboardingDialog
          onSkip={completeTutorial}
          onFinish={completeTutorial}
          onOpenExample={() => openExampleProject(true)}
          compilePassed={compilePassed}
          waveformReady={Boolean(waveform)}
          waveformInteracted={Boolean(waveformSession && waveformSession.cursor > 0)}
          schematicReady={Boolean(netlist)}
          activeView={activeView}
        />
      )}
      {prompt && (
        <TextPromptDialog
          title={
            prompt.kind === 'new-file'
              ? 'Create HDL file'
              : prompt.kind === 'new-folder'
                ? 'Create folder'
                : `Rename ${prompt.node?.name}`
          }
          label={
            prompt.kind === 'new-file'
              ? 'Project-relative filename'
              : prompt.kind === 'new-folder'
                ? 'Project-relative folder name'
                : 'New name'
          }
          initialValue={prompt.initialValue}
          confirmLabel={prompt.kind === 'rename' ? 'Rename' : 'Create'}
          onCancel={() => setPrompt(null)}
          onConfirm={(value) => void submitPrompt(value)}
        />
      )}
      {contextMenu && (
        <ProjectContextMenu
          {...contextMenu}
          onNewFile={(node) => {
            setPrompt({ kind: 'new-file', node, initialValue: 'new_module.sv' });
            setContextMenu(null);
          }}
          onNewFolder={(node) => {
            setPrompt({ kind: 'new-folder', node, initialValue: 'subfolder' });
            setContextMenu(null);
          }}
          onRename={(node) => {
            setPrompt({ kind: 'rename', node, initialValue: node.name });
            setContextMenu(null);
          }}
          onDuplicate={(node) => void duplicateProjectFile(node)}
          onCopyPath={(node) => {
            void navigator.clipboard.writeText(node.path);
            setStatus(`Copied ${node.path}`);
            setContextMenu(null);
          }}
          onReveal={(node) => {
            void window.rtlbench.revealFile(node.path);
            setContextMenu(null);
          }}
          onRemove={(node) => void removeProjectEntry(node)}
        />
      )}
    </div>
  );
}
