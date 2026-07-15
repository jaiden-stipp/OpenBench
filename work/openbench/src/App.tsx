import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader, type BeforeMount, type OnMount } from '@monaco-editor/react';
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
import { ImportProjectDialog, NewProjectDialog, TextPromptDialog } from './ProjectDialogs';
import openBenchLogo from './assets/openbench-logo.png';
import OnboardingDialog from './OnboardingDialog';

type OpenFile = { path: string; content: string; savedContent: string };

loader.config({ monaco: localMonaco });
let hoverHelpRegistered = false;
const SOURCE_CONCEPTS = [
  { match: /always_ff|always\s*@\s*\([^)]*(?:posedge|negedge)/, title: 'Edge-triggered sequential logic', text: 'This block runs on a clock/reset edge. Use non-blocking (`<=`) assignments for registers so every register observes the old state together.' },
  { match: /always_comb|always\s*@\*/, title: 'Combinational logic', text: 'This block recalculates whenever an input it reads changes. Assign every output on every path to avoid accidentally creating storage.' },
  { match: /<=/, title: 'Non-blocking assignment', text: 'The new value is scheduled for the end of the current simulation step. This is normally the right assignment for clocked registers.' },
  { match: /(^|[^<>=!])=([^=]|$)/, title: 'Blocking assignment', text: 'The value changes immediately within this procedural block. This is normally used for combinational calculations, not clocked state.' },
  { match: /\bassign\b/, title: 'Continuous assignment', text: 'The right-hand expression continuously drives the wire whenever any of its inputs changes.' },
  { match: /\blogic\b/, title: 'SystemVerilog logic', text: '`logic` is a four-state variable type: it can hold 0, 1, X (unknown), or Z (high impedance).' },
];
const conceptForLine = (line: string) => SOURCE_CONCEPTS.find((item) => item.match.test(line)) || null;
const consolePresentation = (line: string, diagnostic: ReturnType<typeof parseDiagnostic>) => {
  if (line.includes('💡')) return { kind: 'translation', label: 'EXPLAIN' };
  if (diagnostic) return { kind: 'diagnostic', label: 'SOURCE' };
  if (line.startsWith('$ ')) return { kind: 'command', label: 'RUN' };
  if (/^(?:Starting|Compile finished|Simulation finished|Yosys finished|Opened|Created editable)/.test(line)) return { kind: 'summary', label: 'STATUS' };
  if (/\b(?:warning|error|fatal|sorry:)\b/i.test(line)) return { kind: 'warning', label: 'TOOL' };
  return { kind: 'raw', label: 'RAW' };
};

const configureMonaco: BeforeMount = (monaco) => {
  if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === 'systemverilog')) {
    monaco.languages.register({ id: 'systemverilog', extensions: ['.sv', '.svh', '.v', '.vh'] });
    monaco.languages.setMonarchTokensProvider('systemverilog', {
      keywords: ['module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'logic', 'always', 'always_ff', 'always_comb', 'begin', 'end', 'if', 'else', 'case', 'endcase', 'assign', 'parameter', 'localparam', 'generate', 'endgenerate', 'for', 'posedge', 'negedge', 'initial', 'typedef', 'struct', 'enum', 'package', 'endpackage', 'import'],
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/[a-zA-Z_$][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
          [/\d+'[bodhBODH][0-9a-fA-F_xzXZ?]+/, 'number'],
          [/\d+/, 'number'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/[{}()[\]]/, '@brackets'],
          [/[;,.]/, 'delimiter'],
          [/[=><!~?:&|+\-*\/%^]+/, 'operator'],
        ],
        comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']],
      },
    });
  }
  if (!hoverHelpRegistered) {
    hoverHelpRegistered = true;
    monaco.languages.registerHoverProvider('systemverilog', { provideHover(model: editor.ITextModel, position: localMonaco.Position) {
      const line = model.getLineContent(position.lineNumber);
      const help = conceptForLine(line);
      if (!help) return null;
      return { range: new monaco.Range(position.lineNumber, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)), contents: [{ value: `**${help.title}**` }, { value: help.text }] };
    } });
  }
};

function TreeNode({ node, onOpen, onContext }: { node: ProjectNode; onOpen: (path: string) => void; onContext: (node: ProjectNode, x: number, y: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  if (node.kind === 'file') {
    return <button className="tree-file" onClick={() => onOpen(node.path)} onContextMenu={(event) => { event.preventDefault(); onContext(node, event.clientX, event.clientY); }}><span className="file-dot" />{node.name}</button>;
  }
  return (
    <div className="tree-directory">
      <button className="tree-folder" onClick={() => setExpanded((value) => !value)} onContextMenu={(event) => { event.preventDefault(); onContext(node, event.clientX, event.clientY); }}><span>{expanded ? '▾' : '▸'}</span>{node.name}</button>
      {expanded && <div className="tree-children">{node.children?.map((child) => <TreeNode key={child.path} node={child} onOpen={onOpen} onContext={onContext} />)}</div>}
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [consoleText, setConsoleText] = useState('Open an HDL project to begin.');
  const [compiling, setCompiling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [rtlRunning, setRtlRunning] = useState(false);
  const [activeView, setActiveView] = useState<'source' | 'waveform' | 'schematic'>('source');
  const [consoleMode, setConsoleMode] = useState<'compile' | 'simulation' | 'rtl'>('compile');
  const [waveform, setWaveform] = useState<VcdData | null>(null);
  const [waveformName, setWaveformName] = useState<string | null>(null);
  const [waveformProbe, setWaveformProbe] = useState<string | null>(null);
  const [schematicProbe, setSchematicProbe] = useState<string | null>(null);
  const [breakpoints, setBreakpoints] = useState<WaveBreakpoint[]>([]);
  const [netlist, setNetlist] = useState<YosysNetlist | null>(null);
  const [rtlTop, setRtlTop] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>({ topModule: '', simulationTop: '', includePaths: [], simulator: 'iverilog', toolchainPath: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => localStorage.getItem('openbench.tutorialComplete') !== 'true');
  const [importSelection, setImportSelection] = useState<ProjectSelection | null>(null);
  const [newProjectParent, setNewProjectParent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ kind: 'new-file' | 'new-folder' | 'rename'; node?: ProjectNode; initialValue: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: ProjectNode; x: number; y: number } | null>(null);
  const [sourceConcept, setSourceConcept] = useState<{ title: string; text: string } | null>(null);
  const [watchMode, setWatchMode] = useState(false);
  const [hasRunSimulation, setHasRunSimulation] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('rtlbench.theme') === 'light' ? 'light' : 'dark');
  const [explorerWidth, setExplorerWidth] = useState(248);
  const [consoleHeight, setConsoleHeight] = useState(220);
  const [consoleWidth, setConsoleWidth] = useState(340);
  const [explorerDock, setExplorerDock] = useState<'left' | 'right'>(() => localStorage.getItem('rtlbench.explorerDock') === 'right' ? 'right' : 'left');
  const [consoleDock, setConsoleDock] = useState<'bottom' | 'right'>(() => localStorage.getItem('rtlbench.consoleDock') === 'right' ? 'right' : 'bottom');
  const [status, setStatus] = useState('Ready');
  const [waveformSession, setWaveformSession] = useState<WaveformSession | null>(null);
  const [editorCursor, setEditorCursor] = useState<{ path: string; line: number; column: number } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [lintStatus, setLintStatus] = useState<'idle' | 'checking' | 'clean' | 'issues'>('idle');
  const openFile = openFiles.find((file) => file.path === activeFilePath) || null;
  const updateOpenFile = useCallback((updater: (file: OpenFile) => OpenFile) => {
    if (!activeFilePath) return;
    setOpenFiles((current) => current.map((file) => file.path === activeFilePath ? updater(file) : file));
  }, [activeFilePath]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const waveformWorkerRef = useRef<Worker | null>(null);
  const pendingBreakpointHitRef = useRef<{ condition: string; time: number } | null>(null);
  const watchRunRef = useRef<(() => Promise<void>) | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{ kind: 'explorer' | 'consoleHeight' | 'consoleWidth'; start: number; size: number; direction: 1 | -1 } | null>(null);
  const lintRequestRef = useRef(0);
  const activeFilePathRef = useRef<string | null>(null);
  const openFilesRef = useRef<OpenFile[]>([]);

  useEffect(() => { activeFilePathRef.current = activeFilePath; }, [activeFilePath]);
  useEffect(() => { openFilesRef.current = openFiles; }, [openFiles]);

  useEffect(() => {
    const worker = new Worker(new URL('./vcd.worker.ts', import.meta.url), { type: 'module' });
    waveformWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ ok: boolean; name?: string; data?: VcdData; error?: string }>) => {
      if (event.data.ok && event.data.data) {
        setWaveform(event.data.data);
        setWaveformName(event.data.name ?? 'simulation.vcd');
        setActiveView('waveform');
        const hit = pendingBreakpointHitRef.current;
        pendingBreakpointHitRef.current = null;
        setStatus(hit ? `Stopped at ${hit.condition} (time ${hit.time})` : `Loaded ${event.data.data.signals.length} waveform signals`);
      } else setStatus(event.data.error || 'Unable to parse VCD.');
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    localStorage.setItem('rtlbench.theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('rtlbench.explorerDock', explorerDock); }, [explorerDock]);
  useEffect(() => { localStorage.setItem('rtlbench.consoleDock', consoleDock); }, [consoleDock]);

  useEffect(() => {
    if (!sessionReady) return;
    const timer = setTimeout(() => void window.rtlbench.saveSession({ projectRoot: project?.root || '', openFiles: openFiles.map((file) => file.path), activeFile: activeFilePath || '', activeView, editorCursor, waveform: waveformSession }), 250);
    return () => clearTimeout(timer);
  }, [activeFilePath, activeView, editorCursor, openFiles, project?.root, sessionReady, waveformSession]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const coordinate = resize.kind === 'consoleHeight' ? event.clientY : event.clientX;
      const next = resize.size + (coordinate - resize.start) * resize.direction;
      if (resize.kind === 'explorer') setExplorerWidth(Math.max(170, Math.min(480, next)));
      else if (resize.kind === 'consoleHeight') setConsoleHeight(Math.max(120, Math.min(480, next)));
      else setConsoleWidth(Math.max(240, Math.min(620, next)));
    };
    const stop = () => { resizeRef.current = null; document.body.classList.remove('resizing'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, []);

  useEffect(() => window.rtlbench.onCompileEvent((event) => {
    if (event.type === 'start') {
      setCompiling(true);
      setConsoleMode('compile');
      setConsoleText(`$ ${event.command}\n`);
      setStatus('Compiling');
    } else if (event.type === 'output') {
      setConsoleText((value) => value + event.text);
    } else {
      setCompiling(false);
      setConsoleText((value) => `${value}\nCompile finished with exit code ${event.code}.\n`);
      setStatus(event.code === 0 ? 'Compile passed' : 'Compile failed');
    }
  }), []);

  useEffect(() => window.rtlbench.onSimulationEvent((event) => {
    if (event.type === 'start') {
      setSimulating(true);
      setConsoleMode('simulation');
      setConsoleText(`Starting real ${event.backend === 'verilator' ? 'Verilator' : 'Icarus'} simulation…\n`);
      setStatus('Simulating');
    } else if (event.type === 'output') {
      setConsoleText((value) => value + event.text);
    } else {
      setSimulating(false);
      setConsoleText((value) => `${value}\nSimulation finished with exit code ${event.code}.\n`);
      setStatus(event.code === 0 ? event.breakpointHit ? `Stopped at ${event.breakpointHit.condition} (time ${event.breakpointHit.time})` : `Simulation passed: ${event.vcdPath}` : 'Simulation failed');
    }
  }), []);

  useEffect(() => window.rtlbench.onRtlEvent((event) => {
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
      setStatus(event.code === 0 ? `RTL ready: ${event.top} (${event.moduleCount} modules)` : 'RTL elaboration failed');
    }
  }), []);

  const openPath = useCallback(async (relativePath: string, line?: number, column = 1) => {
    try {
      const existing = openFilesRef.current.find((item) => item.path === relativePath);
      let recovered = false;
      if (!existing) {
        const file = await window.rtlbench.readFile(relativePath);
        const draft = await window.rtlbench.loadRecoveryDraft(relativePath);
        recovered = Boolean(draft && draft.content !== file.content);
        const opened = { ...file, content: draft?.content ?? file.content, savedContent: file.content };
        setOpenFiles((current) => [...current, opened]);
      }
      setActiveFilePath(relativePath);
      setActiveView('source');
      setStatus(recovered ? `Recovered unsaved changes in ${relativePath}` : relativePath);
      requestAnimationFrame(() => {
        const restore = line ? { line, column } : editorCursor?.path === relativePath ? editorCursor : null;
        if (restore && editorRef.current) {
          editorRef.current.setPosition({ lineNumber: restore.line, column: restore.column });
          editorRef.current.revealLineInCenter(restore.line);
          editorRef.current.focus();
        }
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [editorCursor]);

  const loadProject = useCallback(async (next: ProjectData, resetWorkspace = true) => {
    setProject(next);
    if (resetWorkspace) {
      setOpenFiles([]); setActiveFilePath(null); setWaveform(null); setWaveformName(null); setNetlist(null); setRtlTop(null); setBreakpoints([]); setHasRunSimulation(false); setWaveformSession(null); setActiveView('source');
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
        const current = session.projectRoot ? await window.rtlbench.restoreProject(session.projectRoot) : await window.rtlbench.getActiveProject();
        if (!current || cancelled) { setSessionReady(true); return; }
        await loadProject(current, false);
        if (cancelled) return;
        setEditorCursor(session.editorCursor);
        setWaveformSession(session.waveform);
        const restoredFiles: OpenFile[] = [];
        for (const relativePath of session.openFiles.filter((file) => current.files.includes(file))) {
          try {
            const disk = await window.rtlbench.readFile(relativePath);
            const draft = await window.rtlbench.loadRecoveryDraft(relativePath);
            restoredFiles.push({ ...disk, content: draft?.content ?? disk.content, savedContent: disk.content });
          } catch { /* A removed tab should not prevent the rest of the session from opening. */ }
        }
        setOpenFiles(restoredFiles);
        setActiveFilePath(restoredFiles.some((file) => file.path === session.activeFile) ? session.activeFile : restoredFiles.at(-1)?.path || null);
        if (session.activeView === 'waveform') {
          try { waveformWorkerRef.current?.postMessage(await window.rtlbench.readLatestVcd()); }
          catch { setActiveView(restoredFiles.length ? 'source' : 'waveform'); }
        } else if (session.activeView === 'schematic') {
          try { const result = await window.rtlbench.readLatestNetlist(); setNetlist(result.netlist); setRtlTop(result.top); setActiveView('schematic'); }
          catch { setActiveView(restoredFiles.length ? 'source' : 'schematic'); }
        } else setActiveView('source');
        setStatus(`Restored ${current.name}`);
      } catch (error) { setStatus(`Session restore skipped: ${error instanceof Error ? error.message : String(error)}`); }
      finally { if (!cancelled) setSessionReady(true); }
    })();
    return () => { cancelled = true; };
  }, [loadProject]);

  const openProject = async () => {
    try {
      const selection = await window.rtlbench.selectProjectFolder();
      if (selection) setImportSelection(selection);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const activateSelection = async (name: string, files: string[]) => {
    if (!importSelection) return;
    try { const next = await window.rtlbench.activateProject({ root: importSelection.root, name, files }); setImportSelection(null); await loadProject(next); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const beginNewProject = async () => {
    try { const parent = await window.rtlbench.chooseNewProjectParent(); if (parent) setNewProjectParent(parent); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const completeTutorial = () => { localStorage.setItem('openbench.tutorialComplete', 'true'); setShowTutorial(false); };
  const openExampleProject = async () => {
    try {
      completeTutorial();
      const next = await window.rtlbench.openExampleProject();
      await loadProject(next);
      await openPath('getting_started_counter.sv');
      setStatus('Example ready: press Run Simulation');
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const createNewProject = async (name: string, withStarter: boolean) => {
    if (!newProjectParent) return;
    try { const next = await window.rtlbench.createProject({ parent: newProjectParent, name, withStarter }); setNewProjectParent(null); await loadProject(next); const design = next.files.find((file) => !/(^|[_.-])(tb|testbench)([_.-]|$)/i.test(file)) || next.files[0]; if (design) await openPath(design); setStatus(withStarter ? 'Ready: press Run Simulation to see the starter waveform' : 'Empty project created; add an HDL file'); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const refreshProject = useCallback(async () => { const next = await window.rtlbench.refreshProject(); setProject(next); return next; }, []);

  const addProjectFiles = async () => {
    try { const added = await window.rtlbench.addProjectFiles(); if (added.length) { await refreshProject(); await openPath(added[0]); setStatus(`Added ${added.length} file${added.length === 1 ? '' : 's'}`); } }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const submitPrompt = async (value: string) => {
    if (!prompt) return;
    try {
      if (prompt.kind === 'new-file') {
        const base = prompt.node?.kind === 'directory' ? prompt.node.path : '';
        const relative = base ? `${base}/${value}` : value;
        const created = await window.rtlbench.createFile(relative, `// ${value}\n`);
        setPrompt(null); await refreshProject(); await openPath(created);
      } else if (prompt.kind === 'new-folder') {
        const base = prompt.node?.kind === 'directory' ? prompt.node.path : '';
        const relative = base ? `${base}/${value}` : value;
        const created = await window.rtlbench.createFolder(relative);
        setPrompt(null); await refreshProject(); setStatus(`Created folder ${created}`);
      } else if (prompt.node) {
        const oldPath = prompt.node.path;
        const renamed = await window.rtlbench.renameEntry(oldPath, value);
        setPrompt(null); await refreshProject();
        setOpenFiles((current) => current.map((file) => file.path === oldPath || file.path.startsWith(`${oldPath}/`) ? { ...file, path: `${renamed}${file.path.slice(oldPath.length)}` } : file));
        if (activeFilePath && (activeFilePath === oldPath || activeFilePath.startsWith(`${oldPath}/`))) setActiveFilePath(`${renamed}${activeFilePath.slice(oldPath.length)}`);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  const removeProjectEntry = async (node: ProjectNode) => {
    try { const removed = await window.rtlbench.removeEntry(node.path); if (removed) { const remaining = openFiles.filter((file) => file.path !== node.path && !file.path.startsWith(`${node.path}/`)); setOpenFiles(remaining); if (activeFilePath === node.path || activeFilePath?.startsWith(`${node.path}/`)) setActiveFilePath(remaining.at(-1)?.path || null); await refreshProject(); setStatus(`Moved ${node.name} to the Recycle Bin`); } }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    setContextMenu(null);
  };

  const save = useCallback(async (triggerWatch = true) => {
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
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  }, [hasRunSimulation, openFile, updateOpenFile, watchMode]);

  const runInlineLint = useCallback(async (filePath: string) => {
    const request = ++lintRequestRef.current;
    setLintStatus('checking');
    try {
      const result = await window.rtlbench.runInlineLint();
      if (request !== lintRequestRef.current || result.skipped) return;
      const normalizedPath = filePath.replaceAll('\\', '/').toLowerCase();
      const diagnostics = result.output.replaceAll('\r\n', '\n').split('\n').flatMap((line) => {
        const diagnostic = parseDiagnostic(line.replace(/^%[^:]+:\s*/, ''));
        if (!diagnostic) return [];
        const diagnosticPath = diagnostic.path.toLowerCase();
        if (!(diagnosticPath === normalizedPath || diagnosticPath.endsWith(`/${normalizedPath}`))) return [];
        return [{ severity: /warning/i.test(diagnostic.message) ? localMonaco.MarkerSeverity.Warning : localMonaco.MarkerSeverity.Error, message: diagnostic.message || 'HDL syntax error', startLineNumber: diagnostic.line, startColumn: diagnostic.column, endLineNumber: diagnostic.line, endColumn: diagnostic.column + 1 }];
      });
      const model = localMonaco.editor.getModels().find((item) => item.uri.path.replace(/^\//, '').replaceAll('\\', '/').toLowerCase().endsWith(normalizedPath));
      if (model) localMonaco.editor.setModelMarkers(model, 'openbench-inline-lint', diagnostics);
      setLintStatus(diagnostics.length || result.code !== 0 ? 'issues' : 'clean');
    } catch { if (request === lintRequestRef.current) setLintStatus('idle'); }
  }, []);

  useEffect(() => {
    if (!project || !openFile || openFile.content === openFile.savedContent) return;
    const pathAtEdit = openFile.path;
    const contentAtEdit = openFile.content;
    const recoveryTimer = setTimeout(() => void window.rtlbench.saveRecoveryDraft(pathAtEdit, contentAtEdit), 120);
    const autosaveTimer = setTimeout(() => void (async () => {
      try {
        await window.rtlbench.writeFile(pathAtEdit, contentAtEdit);
        setOpenFiles((current) => current.map((file) => file.path === pathAtEdit && file.content === contentAtEdit ? { ...file, savedContent: contentAtEdit } : file));
        await window.rtlbench.clearRecoveryDraft(pathAtEdit);
        setStatus(`Autosaved ${pathAtEdit}`);
        await runInlineLint(pathAtEdit);
      } catch (error) { setStatus(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`); }
    })(), 900);
    return () => { clearTimeout(recoveryTimer); clearTimeout(autosaveTimer); };
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
    try { await window.rtlbench.runCompile(); }
    catch (error) {
      setCompiling(false);
      const message = error instanceof Error ? error.message : String(error);
      setConsoleText((value) => `${value}\n${message}\n`);
      setStatus(message);
    }
  };

  const runSimulation = async () => {
    try {
      if (openFile && openFile.content !== openFile.savedContent) await save(false);
      const result = await window.rtlbench.runSimulation(breakpoints);
      pendingBreakpointHitRef.current = result.breakpointHit || null;
      setHasRunSimulation(true);
      setStatus('Parsing VCD off the UI thread');
      const vcd = await window.rtlbench.readLatestVcd();
      waveformWorkerRef.current?.postMessage(vcd);
    } catch (error) {
      setSimulating(false);
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

  const navigateYosysSource = useCallback((source: string) => {
    if (!project) return;
    const location = parseYosysSource(source, project.root);
    if (location) void openPath(location.path, location.line, location.column);
    else setStatus(`No source location for ${source}`);
  }, [openPath, project]);

  const navigateWaveSignal = useCallback((signal: VcdSignal) => {
    const cleanName = signal.name.replace(/\s*\[[^\]]+\]\s*$/, '');
    setSchematicProbe(cleanName);
    const source = netlist ? sourceForNet(netlist, signal.path) : null;
    if (source) navigateYosysSource(source);
    else setStatus(`No Yosys declaration found for ${signal.path}. Run RTL Analysis first.`);
  }, [navigateYosysSource, netlist]);

  const generateTestbench = async (moduleName: string) => {
    try {
      const generated = await window.rtlbench.generateTestbench(moduleName);
      setProject(await window.rtlbench.refreshProject());
      await openPath(generated.path);
      const found = [...generated.detected.clocks.map((name) => `clock ${name}`), ...generated.detected.resets.map((name) => `reset ${name}`)].join(', ');
      setStatus(`Created ${generated.path}${found ? `; detected ${found}` : ''}`);
      setConsoleText((value) => `${value}\nCreated editable starter testbench ${generated.path} from real Yosys port metadata.\n`);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); void beginNewProject(); }
      else if (modifier && event.key.toLowerCase() === 'o') { event.preventDefault(); void openProject(); }
      else if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); if (project) setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' }); }
      else if (modifier && event.shiftKey && event.key.toLowerCase() === 'b') { event.preventDefault(); if (project && !compiling && !simulating && !rtlRunning) void runCompile(); }
      else if (modifier && event.shiftKey && event.key.toLowerCase() === 'r') { event.preventDefault(); if (project && !compiling && !simulating && !rtlRunning) void runRtl(); }
      else if (event.key === 'F5') { event.preventDefault(); if (project && !compiling && !simulating && !rtlRunning) void runSimulation(); }
      else if (activeView === 'waveform' && modifier && (event.key === '+' || event.key === '=')) { event.preventDefault(); window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: .5 })); }
      else if (activeView === 'waveform' && modifier && event.key === '-') { event.preventDefault(); window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 2 })); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [activeView, compiling, project, rtlRunning, simulating, runRtl, runSimulation]);

  const consoleLines = useMemo(() => consoleText.replaceAll('\r\n', '\n').split('\n'), [consoleText]);
  const onEditorMount: OnMount = (instance) => {
    editorRef.current = instance;
    instance.onDidChangeCursorPosition((event) => {
      const line = instance.getModel()?.getLineContent(event.position.lineNumber) || '';
      setSourceConcept(conceptForLine(line));
      if (activeFilePathRef.current) setEditorCursor({ path: activeFilePathRef.current, line: event.position.lineNumber, column: event.position.column });
    });
    if (editorCursor?.path === activeFilePath) { instance.setPosition({ lineNumber: editorCursor.line, column: editorCursor.column }); instance.revealLineInCenter(editorCursor.line); }
  };

  useEffect(() => {
    const insertText = (event: Event) => {
      updateOpenFile((file) => ({ ...file, content: `${file.content}${(event as CustomEvent<string>).detail}` }));
    };
    window.addEventListener('rtlbench:insert-editor-text', insertText);
    const showConcept = (event: Event) => {
      const instance = editorRef.current;
      if (!instance) return;
      const detail = (event as CustomEvent<{ line: number; column: number }>).detail;
      instance.setPosition({ lineNumber: detail.line, column: detail.column });
      setSourceConcept(conceptForLine(instance.getModel()?.getLineContent(detail.line) || '') || SOURCE_CONCEPTS[0]);
      instance.focus();
      void instance.getAction('editor.action.showHover')?.run();
    };
    window.addEventListener('rtlbench:show-concept', showConcept);
    const showNewProject = (event: Event) => setNewProjectParent((event as CustomEvent<string>).detail);
    const showImport = (event: Event) => setImportSelection((event as CustomEvent<ProjectSelection>).detail);
    window.addEventListener('openbench:show-new-project', showNewProject);
    window.addEventListener('openbench:show-import', showImport);
    return () => { window.removeEventListener('rtlbench:insert-editor-text', insertText); window.removeEventListener('rtlbench:show-concept', showConcept); window.removeEventListener('openbench:show-new-project', showNewProject); window.removeEventListener('openbench:show-import', showImport); };
  }, [updateOpenFile]);

  useEffect(() => { const close = () => setContextMenu(null); window.addEventListener('pointerdown', close); window.addEventListener('blur', close); return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); }; }, []);

  const composeFeedbackEmail = async (kind: 'feedback' | 'bug') => {
    try {
      await window.rtlbench.composeFeedbackEmail(kind, settings.simulator);
      setStatus(kind === 'bug' ? 'Opened bug report in your email app' : 'Opened feedback in your email app');
    } catch (error) {
      setStatus(`Could not open your email app: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const menuActions: Record<string, () => void> = {
    newProject: () => void beginNewProject(), openProject: () => void openProject(), newFile: () => setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' }), newFolder: () => setPrompt({ kind: 'new-folder', initialValue: 'rtl' }), addFiles: () => void addProjectFiles(), save: () => void save(), settings: () => setShowSettings(true), close: () => void window.rtlbench.windowAction('close'),
    undo: () => editorRef.current?.trigger('menu', 'undo', null), redo: () => editorRef.current?.trigger('menu', 'redo', null), cut: () => editorRef.current?.trigger('menu', 'editor.action.clipboardCutAction', null), copy: () => editorRef.current?.trigger('menu', 'editor.action.clipboardCopyAction', null), paste: () => editorRef.current?.trigger('menu', 'editor.action.clipboardPasteAction', null), selectAll: () => editorRef.current?.trigger('menu', 'editor.action.selectAll', null),
    source: () => setActiveView('source'), waveform: () => setActiveView('waveform'), schematic: () => setActiveView('schematic'), zoomIn: () => window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: .5 })), zoomOut: () => window.dispatchEvent(new CustomEvent('rtlbench:wave-zoom', { detail: 2 })), theme: () => setTheme((value) => value === 'dark' ? 'light' : 'dark'),
    explorerLeft: () => setExplorerDock('left'), explorerRight: () => setExplorerDock('right'), consoleBottom: () => setConsoleDock('bottom'), consoleRight: () => setConsoleDock('right'), watch: () => setWatchMode((value) => !value), minimize: () => void window.rtlbench.windowAction('minimize'), maximize: () => void window.rtlbench.windowAction('maximize'),
    tutorial: () => setShowTutorial(true), example: () => void openExampleProject(), help: () => setShowHelp(true), feedback: () => void composeFeedbackEmail('feedback'), reportBug: () => void composeFeedbackEmail('bug'), about: () => setShowAbout(true),
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
        <div className="brand"><span className="brand-mark"><img className="theme-logo" src={openBenchLogo} alt="" /></span><span>OpenBench</span><small>PREVIEW</small></div>
        <AppMenu hasProject={Boolean(project)} hasFile={Boolean(openFile)} hasWaveform={Boolean(waveform)} hasSchematic={Boolean(netlist)} activeView={activeView} watchMode={watchMode} theme={theme} explorerDock={explorerDock} consoleDock={consoleDock} actions={menuActions} />
        <div className="toolbar run-toolbar">
          <button className="visually-hidden" data-testid="save-file" disabled={!openFile || openFile.content === openFile.savedContent} onClick={() => void save()}>Save</button>
          <button data-testid="run-compile" title="Ctrl+Shift+B" disabled={!project || compiling || simulating || rtlRunning} onClick={() => void runCompile()}>{compiling ? 'Compiling…' : 'Run Compile'}</button>
          <button data-testid="run-simulation" title="F5" disabled={!project || compiling || simulating || rtlRunning} onClick={() => void runSimulation()}>{simulating ? 'Simulating…' : 'Run Simulation'}</button>
          <button data-testid="run-rtl" title="Ctrl+Shift+R" className="primary" disabled={!project || compiling || simulating || rtlRunning} onClick={() => void runRtl()}>{rtlRunning ? 'Elaborating…' : 'RTL Analysis'}</button>
          <button data-testid="watch-toggle" className={watchMode ? 'watch-active' : ''} title={hasRunSimulation ? 'Automatically recompile, rerun, and refresh the waveform after a source save' : 'Run one simulation before enabling automatic reruns'} disabled={!project} onClick={() => setWatchMode((value) => !value)}>Watch {watchMode ? 'On' : 'Off'}</button>
          <button className="icon-action" data-testid="open-settings" title="Project settings" disabled={!project} onClick={() => setShowSettings(true)}>⚙</button>
          <button className="icon-action" data-testid="open-help" title="Beginner guide" onClick={() => setShowHelp(true)}>?</button>
          <button className="visually-hidden" data-testid="theme-toggle" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>Theme</button>
          <select className="visually-hidden" aria-label="Explorer dock" value={explorerDock} onChange={(event) => setExplorerDock(event.target.value as 'left' | 'right')}><option value="left">Explorer: Left</option><option value="right">Explorer: Right</option></select>
          <select className="visually-hidden" aria-label="Console dock" value={consoleDock} onChange={(event) => setConsoleDock(event.target.value as 'bottom' | 'right')}><option value="bottom">Console: Bottom</option><option value="right">Console: Right</option></select>
        </div>
      </header>
      <main className="workspace" style={{ gridTemplateColumns: explorerDock === 'left' ? `${explorerWidth}px 4px minmax(0, 1fr)` : `minmax(0, 1fr) 4px ${explorerWidth}px`, gridTemplateAreas: explorerDock === 'left' ? '"explorer explorerSplitter center"' : '"center explorerSplitter explorer"' }}>
        <aside className="explorer panel" style={{ gridArea: 'explorer' }}>
          <div className="panel-title"><span>PROJECT</span><div className="panel-actions"><button title="New HDL file" disabled={!project} onClick={() => setPrompt({ kind: 'new-file', initialValue: 'new_module.sv' })}>＋</button><button title="New folder" disabled={!project} onClick={() => setPrompt({ kind: 'new-folder', initialValue: 'rtl' })}>▱</button><button title="Add existing HDL files" disabled={!project} onClick={() => void addProjectFiles()}>⇧</button><button title="Refresh" disabled={!project} onClick={() => void refreshProject()}>↻</button></div></div>
          {project ? <><div className="project-root">{project.name}<small>{project.files.length} files · {project.folders.length} folders</small></div><div className="tree">{project.tree.map((node) => <TreeNode key={node.path} node={node} onOpen={(path) => void openPath(path)} onContext={(item, x, y) => setContextMenu({ node: item, x, y })} />)}</div></> : <div className="empty">No project open<br /><button onClick={() => void openExampleProject()}>Explore Example</button><button onClick={() => void beginNewProject()}>New Project</button><button onClick={() => void openProject()}>Add Folder</button></div>}
        </aside>
        <div className="splitter vertical" style={{ gridArea: 'explorerSplitter' }} onPointerDown={(event) => { resizeRef.current = { kind: 'explorer', start: event.clientX, size: explorerWidth, direction: explorerDock === 'left' ? 1 : -1 }; document.body.classList.add('resizing'); }} />
        <section className={`center-column console-${consoleDock}`} style={consoleDock === 'bottom' ? { gridArea: 'center', gridTemplateRows: `minmax(280px, 1fr) 4px ${consoleHeight}px`, gridTemplateAreas: '"editor" "consoleSplitter" "console"' } : { gridArea: 'center', gridTemplateColumns: `minmax(400px, 1fr) 4px ${consoleWidth}px`, gridTemplateAreas: '"editor consoleSplitter console"' }}>
          <div className={`editor-panel panel ${activeView === 'source' && openFiles.length ? 'with-file-tabs' : ''}`} style={{ gridArea: 'editor' }}>
            <div className="tabbar view-tabs"><button className={activeView === 'source' ? 'active' : ''} onClick={() => setActiveView('source')}>Source</button><button className={activeView === 'waveform' ? 'active' : ''} onClick={() => setActiveView('waveform')}>Waveform{waveform ? ` · ${waveform.signals.length}` : ''}</button><button className={activeView === 'schematic' ? 'active' : ''} onClick={() => setActiveView('schematic')}>RTL Schematic{rtlTop ? ` · ${rtlTop}` : ''}</button><span className={`lint-state ${lintStatus}`}>{lintStatus === 'checking' ? 'Checking…' : lintStatus === 'issues' ? 'Lint issues' : lintStatus === 'clean' ? 'Lint clean' : ''}</span></div>
            {activeView === 'source' && openFiles.length > 0 && <div className="file-tabs">{openFiles.map((file) => <button key={file.path} className={file.path === activeFilePath ? 'active' : ''} title={file.path} onClick={() => { setActiveFilePath(file.path); setActiveView('source'); }}><span>{file.path}</span>{file.content !== file.savedContent && <i>●</i>}<b aria-label={`Close ${file.path}`} onClick={async (event) => { event.stopPropagation(); if (file.content !== file.savedContent) { await window.rtlbench.writeFile(file.path, file.content); await window.rtlbench.clearRecoveryDraft(file.path); } const remaining = openFiles.filter((item) => item.path !== file.path); setOpenFiles(remaining); if (activeFilePath === file.path) setActiveFilePath(remaining.at(-1)?.path || null); }}>×</b></button>)}</div>}
            {activeView === 'source' ? (openFile ? <Editor beforeMount={configureMonaco} onMount={onEditorMount} language="systemverilog" theme={theme === 'dark' ? 'vs-dark' : 'light'} path={openFile.path} value={openFile.content} onChange={(content) => updateOpenFile((file) => ({ ...file, content: content ?? '' }))} options={{ minimap: { enabled: true }, fontSize: 14, fontFamily: "'Cascadia Code', Consolas, monospace", automaticLayout: true, scrollBeyondLastLine: false, renderWhitespace: 'selection', tabSize: 4 }} /> : <div className="editor-empty"><div className="chip">HDL</div><h1>Open a Verilog or SystemVerilog file</h1><p>Select a source file from the project tree.</p></div>) : activeView === 'waveform' ? <WaveformPanel data={waveform} name={waveformName} probeSignal={waveformProbe} onSignalNavigate={navigateWaveSignal} theme={theme} breakpoints={breakpoints} onBreakpointsChange={setBreakpoints} breakpointSupported={settings.simulator === 'iverilog'} initialSession={waveformSession} onSessionChange={setWaveformSession} /> : <SchematicPanel netlist={netlist} top={rtlTop} probeNet={schematicProbe} onNetProbe={(netName) => { setWaveformProbe(netName); if (waveform) setActiveView('waveform'); else setStatus(`Net ${netName} selected; run simulation to cross-probe its waveform.`); }} onNavigateSource={navigateYosysSource} onGenerateTestbench={(moduleName) => void generateTestbench(moduleName)} />}
            {activeView === 'source' && sourceConcept && <aside className="source-concept-card"><button aria-label="Close concept" onClick={() => setSourceConcept(null)}>×</button><strong>{sourceConcept.title}</strong><span>{sourceConcept.text}</span></aside>}
          </div>
          <div className={`splitter ${consoleDock === 'bottom' ? 'horizontal' : 'vertical'}`} style={{ gridArea: 'consoleSplitter' }} onPointerDown={(event) => { resizeRef.current = consoleDock === 'bottom' ? { kind: 'consoleHeight', start: event.clientY, size: consoleHeight, direction: -1 } : { kind: 'consoleWidth', start: event.clientX, size: consoleWidth, direction: -1 }; document.body.classList.add('resizing'); }} />
          <div className="console-panel panel" style={{ gridArea: 'console' }}>
            <div className="panel-title"><span>{consoleMode === 'compile' ? 'COMPILE OUTPUT' : consoleMode === 'simulation' ? 'SIMULATION OUTPUT' : 'YOSYS OUTPUT'}</span><button onClick={() => setConsoleText('')}>Clear</button></div>
            <div className="console" role="log">{consoleLines.map((line, index) => {
              const diagnostic = parseDiagnostic(line);
              const presentation = consolePresentation(line, diagnostic);
              const body = <><span className="console-kind">{line ? presentation.label : ''}</span><span className="console-message">{line || ' '}</span></>;
              const className = `console-line ${presentation.kind}${presentation.kind === 'translation' ? ' translated' : ''}`;
              return diagnostic ? <button key={index} className={className} title="Open source location" onClick={() => void openPath(diagnostic.path, diagnostic.line, diagnostic.column)}>{body}</button> : <div key={index} className={className}>{body}</div>;
            })}</div>
          </div>
        </section>
      </main>
      <footer><span>{project?.root ?? 'No project'}</span><span>{activeView === 'source' ? openFile?.path ?? 'No file selected' : activeView === 'waveform' ? waveformName ?? 'No waveform' : rtlTop ?? 'No RTL netlist'}</span><span className={status.toLowerCase().includes('failed') ? 'bad' : ''}>{status}</span></footer>
      {showSettings && <SettingsDialog initial={settings} onClose={() => setShowSettings(false)} onSave={async (next) => { const saved = await window.rtlbench.saveSettings(next); setSettings(saved); setStatus('Project settings saved'); }} />}
      {showHelp && <HelpDialog simulator={settings.simulator} onClose={() => setShowHelp(false)} onComposeEmail={(kind) => void composeFeedbackEmail(kind)} />}
      {showAbout && <div className="modal-backdrop"><section className="project-dialog compact about-dialog" role="dialog" aria-modal="true"><div className="settings-heading"><div><small>ABOUT</small><h2>OpenBench Preview</h2></div><button aria-label="Close" onClick={() => setShowAbout(false)}>×</button></div><p>A zero-setup Verilog/SystemVerilog workbench built around genuine Icarus, Verilator, and Yosys backends.</p><div className="about-points"><span>Real simulation and VCD waveforms</span><span>Yosys JSON RTL schematics</span><span>Beginner-oriented explanations</span></div><p className="license-notice">Copyright © 2026 Jaiden Stipp and OpenBench contributors. OpenBench is free software under the GNU GPL v3.0 and comes with absolutely no warranty. Bundled third-party tools retain their own licenses.</p><div className="dialog-actions"><button className="primary" onClick={() => setShowAbout(false)}>Done</button></div></section></div>}
      {importSelection && <ImportProjectDialog selection={importSelection} onCancel={() => setImportSelection(null)} onConfirm={(name, files) => void activateSelection(name, files)} />}
      {newProjectParent && <NewProjectDialog parent={newProjectParent} onCancel={() => setNewProjectParent(null)} onCreate={(name, withStarter) => void createNewProject(name, withStarter)} />}
      {showTutorial && <OnboardingDialog onSkip={completeTutorial} onOpenExample={() => void openExampleProject()} />}
      {prompt && <TextPromptDialog title={prompt.kind === 'new-file' ? 'Create HDL file' : prompt.kind === 'new-folder' ? 'Create folder' : `Rename ${prompt.node?.name}`} label={prompt.kind === 'new-file' ? 'Project-relative filename' : prompt.kind === 'new-folder' ? 'Project-relative folder name' : 'New name'} initialValue={prompt.initialValue} confirmLabel={prompt.kind === 'rename' ? 'Rename' : 'Create'} onCancel={() => setPrompt(null)} onConfirm={(value) => void submitPrompt(value)} />}
      {contextMenu && <div className="project-context-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 210), top: Math.min(contextMenu.y, window.innerHeight - 260) }} onPointerDown={(event) => event.stopPropagation()}>
        {contextMenu.node.kind === 'directory' && <><button onClick={() => { setPrompt({ kind: 'new-file', node: contextMenu.node, initialValue: 'new_module.sv' }); setContextMenu(null); }}>New File Here…</button><button onClick={() => { setPrompt({ kind: 'new-folder', node: contextMenu.node, initialValue: 'subfolder' }); setContextMenu(null); }}>New Folder Here…</button></>}
        <button onClick={() => { setPrompt({ kind: 'rename', node: contextMenu.node, initialValue: contextMenu.node.name }); setContextMenu(null); }}>Rename…</button>
        {contextMenu.node.kind === 'file' && <button onClick={async () => { try { const copy = await window.rtlbench.duplicateFile(contextMenu.node.path); await refreshProject(); setContextMenu(null); await openPath(copy); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); } }}>Duplicate</button>}
        <button onClick={() => { void navigator.clipboard.writeText(contextMenu.node.path); setStatus(`Copied ${contextMenu.node.path}`); setContextMenu(null); }}>Copy Relative Path</button>
        <button onClick={() => { void window.rtlbench.revealFile(contextMenu.node.path); setContextMenu(null); }}>Show in File Explorer</button>
        <div className="menu-separator" />
        <button className="danger" onClick={() => void removeProjectEntry(contextMenu.node)}>Move to Recycle Bin…</button>
      </div>}
    </div>
  );
}
