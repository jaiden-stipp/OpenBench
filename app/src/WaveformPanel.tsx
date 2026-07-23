import { useEffect, useMemo, useRef, useState } from 'react';
import type { VcdData, VcdSignal } from './vcdParser.js';
import { drawWaveforms, HEADER_HEIGHT, ROW_HEIGHT } from './waveformRenderer';
import { adjacentTransitionTime, formatSimulationTime, hasChangeInRange } from './waveformMath.js';
import WaveformSignalList, {
  type SignalView,
  type VisibleSignal,
} from './components/WaveformSignalList';

type SignalPreset = 'all' | 'essentials' | 'clocks-resets' | 'selected';
type SimulationRun = {
  id: string;
  name: string;
  createdAt: number;
  data?: VcdData;
  files: Record<string, string>;
  fileName?: string;
  size?: number;
  loading?: boolean;
};
type Props = {
  data: VcdData | null;
  name: string | null;
  runs?: SimulationRun[];
  probeSignal?: string | null;
  onSignalNavigate?: (signal: VcdSignal) => void;
  onLoadRun?: (runId: string, open?: boolean) => Promise<void>;
  theme?: 'dark' | 'light';
  displayOptions?: { highContrast: boolean; largeText: boolean };
  breakpoints: WaveBreakpoint[];
  onBreakpointsChange: (items: WaveBreakpoint[]) => void;
  breakpointSupported: boolean;
  initialSession?: WaveformSession | null;
  onSessionChange?: (session: WaveformSession) => void;
};

export default function WaveformPanel(props: Props) {
  const runs = props.runs || [];
  const controls = useWaveformControls(props.initialSession);
  useSessionSynchronization(props, controls);
  useProbeSynchronization(props.probeSignal, controls);
  const derived = useWaveformDerived(props.data, runs, controls);
  useCanvasRendering(props, controls, derived);
  useViewportInput(props.data, controls);
  const actions = useWaveformActions(props.data, controls, derived);
  if (!props.data) return <EmptyWaveform runs={runs} onLoadRun={props.onLoadRun} />;
  return (
    <div className={`waveform-panel ${controls.advancedTools ? 'with-advanced-tools' : ''}`}>
      <WaveformToolbar
        data={props.data}
        name={props.name}
        breakpoints={props.breakpoints}
        controls={controls}
        derived={derived}
        actions={actions}
      />
      {controls.advancedTools && (
        <AdvancedWaveformTools
          data={props.data}
          runs={runs}
          onLoadRun={props.onLoadRun}
          controls={controls}
          derived={derived}
          actions={actions}
        />
      )}
      <WaveformGrid
        {...props}
        data={props.data}
        controls={controls}
        derived={derived}
        actions={actions}
      />
    </div>
  );
}

function useWaveformControls(initialSession?: WaveformSession | null) {
  const [views, setViews] = useState<SignalView[]>([]);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<SignalPreset>('all');
  const [groupFilter, setGroupFilter] = useState('All groups');
  const [groupName, setGroupName] = useState('');
  const [viewport, setViewport] = useState({ start: 0, end: 1 });
  const [cursor, setCursor] = useState(0);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [activeCursor, setActiveCursor] = useState<'A' | 'B'>('A');
  const [bookmarks, setBookmarks] = useState<Array<{ time: number; label: string }>>([]);
  const [bookmarkName, setBookmarkName] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [compareRunId, setCompareRunId] = useState('');
  const [editingBreakpoint, setEditingBreakpoint] = useState<string | null>(null);
  const [breakpointValue, setBreakpointValue] = useState('1');
  const [logicHelp, setLogicHelp] = useState<string | null>(null);
  const [advancedTools, setAdvancedTools] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragKey = useRef<string | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const pendingViewport = useRef(viewport);
  const initialSessionRef = useRef(initialSession);
  return {
    views,
    setViews,
    search,
    setSearch,
    preset,
    setPreset,
    groupFilter,
    setGroupFilter,
    groupName,
    setGroupName,
    viewport,
    setViewport,
    cursor,
    setCursor,
    cursorB,
    setCursorB,
    activeCursor,
    setActiveCursor,
    bookmarks,
    setBookmarks,
    bookmarkName,
    setBookmarkName,
    changedOnly,
    setChangedOnly,
    compareRunId,
    setCompareRunId,
    editingBreakpoint,
    setEditingBreakpoint,
    breakpointValue,
    setBreakpointValue,
    logicHelp,
    setLogicHelp,
    advancedTools,
    setAdvancedTools,
    scrollTop,
    setScrollTop,
    viewportHeight,
    setViewportHeight,
    canvasRef,
    gridRef,
    dragKey,
    wheelFrame,
    pendingViewport,
    initialSessionRef,
  };
}

type Controls = ReturnType<typeof useWaveformControls>;

function useSessionSynchronization(props: Props, controls: Controls) {
  const controlsRef = useRef(controls);
  const propsRef = useRef(props);
  controlsRef.current = controls;
  propsRef.current = props;
  useEffect(() => {
    controls.pendingViewport.current = controls.viewport;
  }, [controls.pendingViewport, controls.viewport]);
  useEffect(() => {
    controls.initialSessionRef.current = props.initialSession;
  }, [controls.initialSessionRef, props.initialSession]);
  useEffect(() => {
    const controls = controlsRef.current;
    const props = propsRef.current;
    if (!props.data) return;
    const session = controls.initialSessionRef.current;
    const defaults = props.data.signals.map((signal) => ({
      key: signal.key,
      radix: signal.width > 4 ? ('hex' as const) : ('bin' as const),
      group: signal.scope || 'Top',
      selected: false,
    }));
    const restored = new Map(session?.views.map((view) => [view.key, view]) || []);
    controls.setViews(
      defaults
        .map((view) => (restored.has(view.key) ? { ...view, ...restored.get(view.key)! } : view))
        .sort(
          (a, b) =>
            (session?.views.findIndex((view) => view.key === a.key) ?? 9999) -
            (session?.views.findIndex((view) => view.key === b.key) ?? 9999),
        ),
    );
    const fullEnd = Math.max(1, props.data.endTime);
    controls.setSearch(session?.search || '');
    controls.setPreset(session?.preset || (props.data.signals.length > 32 ? 'essentials' : 'all'));
    controls.setGroupFilter(session?.groupFilter || 'All groups');
    controls.setViewport({
      start: Math.max(0, Math.min(fullEnd - 1, session?.viewStart ?? 0)),
      end: Math.max(1, Math.min(fullEnd, session?.viewEnd ?? fullEnd)),
    });
    controls.setCursor(Math.max(0, Math.min(fullEnd, session?.cursor ?? 0)));
    controls.setCursorB(
      session?.cursorB == null ? null : Math.max(0, Math.min(fullEnd, session.cursorB)),
    );
    controls.setBookmarks(session?.bookmarks || []);
  }, [
    props.data,
    controls.initialSessionRef,
    controls.setBookmarks,
    controls.setCursor,
    controls.setCursorB,
    controls.setGroupFilter,
    controls.setPreset,
    controls.setSearch,
    controls.setViewport,
    controls.setViews,
  ]);
  useEffect(() => {
    const controls = controlsRef.current;
    const props = propsRef.current;
    if (!props.data || !controls.views.length) return;
    const timer = setTimeout(
      () =>
        props.onSessionChange?.({
          views: controls.views,
          search: controls.search,
          groupFilter: controls.groupFilter,
          viewStart: controls.viewport.start,
          viewEnd: controls.viewport.end,
          cursor: controls.cursor,
          cursorB: controls.cursorB,
          bookmarks: controls.bookmarks,
          preset: controls.preset,
        }),
      100,
    );
    return () => clearTimeout(timer);
  }, [
    controls.bookmarks,
    controls.cursor,
    controls.cursorB,
    controls.groupFilter,
    controls.preset,
    controls.search,
    controls.viewport,
    controls.views,
    props.data,
    props.onSessionChange,
  ]);
}

function useProbeSynchronization(probeSignal: string | null | undefined, controls: Controls) {
  const { setGroupFilter, setSearch } = controls;
  useEffect(() => {
    if (!probeSignal) return;
    setSearch(
      probeSignal
        .replace(/^\\/, '')
        .replace(/\s*\[[^\]]+\]\s*$/, '')
        .split('.')
        .at(-1) || probeSignal,
    );
    setGroupFilter('All groups');
  }, [probeSignal, setGroupFilter, setSearch]);
}

function useWaveformDerived(data: VcdData | null, runs: SimulationRun[], controls: Controls) {
  const signalMap = useMemo(
    () => new Map(data?.signals.map((signal) => [signal.key, signal]) || []),
    [data],
  );
  const groups = useMemo(
    () => ['All groups', ...Array.from(new Set(controls.views.map((view) => view.group)))],
    [controls.views],
  );
  const visibleSignals = useMemo<VisibleSignal[]>(
    () =>
      controls.views.flatMap((view) => {
        const signal = signalMap.get(view.key);
        if (!signal || !signal.path.toLowerCase().includes(controls.search.toLowerCase()))
          return [];
        if (!matchesPreset(signal, view, controls.preset)) return [];
        if (controls.groupFilter !== 'All groups' && view.group !== controls.groupFilter) return [];
        if (
          controls.changedOnly &&
          !hasChangeInRange(signal.changes, controls.viewport.start, controls.viewport.end)
        )
          return [];
        return [{ ...view, signal }];
      }),
    [
      controls.changedOnly,
      controls.groupFilter,
      controls.preset,
      controls.search,
      controls.viewport,
      controls.views,
      signalMap,
    ],
  );
  const virtualRange = useMemo(() => {
    const first = Math.max(0, Math.floor((controls.scrollTop - HEADER_HEIGHT) / ROW_HEIGHT) - 5);
    const last = Math.min(
      visibleSignals.length,
      Math.ceil((controls.scrollTop + controls.viewportHeight - HEADER_HEIGHT) / ROW_HEIGHT) + 5,
    );
    return { first, last, signals: visibleSignals.slice(first, last) };
  }, [controls.scrollTop, controls.viewportHeight, visibleSignals]);
  const compareRun = runs.find((run) => run.id === controls.compareRunId);
  const compareByPath = useMemo(
    () => new Map(compareRun?.data?.signals.map((signal) => [signal.path, signal]) || []),
    [compareRun],
  );
  return { signalMap, groups, visibleSignals, virtualRange, compareByPath };
}

type Derived = ReturnType<typeof useWaveformDerived>;

function useCanvasRendering(props: Props, controls: Controls, derived: Derived) {
  const controlsRef = useRef(controls);
  const propsRef = useRef(props);
  controlsRef.current = controls;
  propsRef.current = props;
  useEffect(() => {
    const controls = controlsRef.current;
    const props = propsRef.current;
    const canvas = controls.canvasRef.current;
    if (!canvas || !props.data) return;
    const render = () =>
      drawWaveforms({
        canvas,
        signals: derived.virtualRange.signals,
        data: props.data!,
        viewStart: controls.viewport.start,
        viewEnd: controls.viewport.end,
        cursor: controls.cursor,
        cursorB: controls.cursorB,
        bookmarks: controls.bookmarks,
        theme: props.theme || 'dark',
        displayOptions: props.displayOptions || { highContrast: false, largeText: false },
        viewportHeight: controls.viewportHeight,
        rowOffset: derived.virtualRange.first,
      });
    let frame = requestAnimationFrame(render);
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    const observer = new ResizeObserver(redraw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    controls.bookmarks,
    controls.canvasRef,
    controls.cursor,
    controls.cursorB,
    controls.viewport,
    controls.viewportHeight,
    derived.virtualRange,
    props.data,
    props.displayOptions,
    props.theme,
  ]);
  useEffect(() => {
    const controls = controlsRef.current;
    const grid = controls.gridRef.current;
    if (!grid) return;
    const update = () => controls.setViewportHeight(grid.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [controls.gridRef, controls.setViewportHeight]);
}

function useViewportInput(data: VcdData | null, controls: Controls) {
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  useEffect(() => {
    const controls = controlsRef.current;
    const canvas = controls.canvasRef.current;
    if (!canvas || !data) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const fullEnd = Math.max(1, data.endTime),
        current = controls.pendingViewport.current;
      const span = Math.max(1, current.end - current.start);
      let next;
      if (event.shiftKey) {
        const delta = span * Math.sign(event.deltaY) * 0.12;
        const start = Math.max(0, Math.min(fullEnd - span, current.start + delta));
        next = { start, end: start + span };
      } else {
        const rect = canvas.getBoundingClientRect();
        const anchor = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const nextSpan = Math.max(1, Math.min(fullEnd, span * Math.exp(event.deltaY * 0.0015)));
        let start = current.start + span * anchor - nextSpan * anchor;
        start = Math.max(0, Math.min(fullEnd - nextSpan, start));
        next = { start, end: start + nextSpan };
      }
      controls.pendingViewport.current = next;
      if (controls.wheelFrame.current === null)
        controls.wheelFrame.current = requestAnimationFrame(() => {
          controls.wheelFrame.current = null;
          controls.setViewport(controls.pendingViewport.current);
        });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      if (controls.wheelFrame.current !== null) cancelAnimationFrame(controls.wheelFrame.current);
      controls.wheelFrame.current = null;
    };
  }, [
    controls.canvasRef,
    controls.pendingViewport,
    controls.setViewport,
    controls.wheelFrame,
    data,
  ]);
  useEffect(() => {
    const controls = controlsRef.current;
    const onZoom = (event: Event) => {
      if (!data) return;
      const fullEnd = Math.max(1, data.endTime),
        span = controls.viewport.end - controls.viewport.start;
      const nextSpan = Math.max(1, Math.min(fullEnd, span * (event as CustomEvent<number>).detail));
      const start = Math.max(
        0,
        Math.min(
          fullEnd - nextSpan,
          (controls.viewport.start + controls.viewport.end) / 2 - nextSpan / 2,
        ),
      );
      controls.setViewport({ start, end: start + nextSpan });
    };
    window.addEventListener('rtldeck:wave-zoom', onZoom);
    window.addEventListener('openbench:wave-zoom', onZoom);
    window.addEventListener('rtlbench:wave-zoom', onZoom);
    return () => {
      window.removeEventListener('rtldeck:wave-zoom', onZoom);
      window.removeEventListener('openbench:wave-zoom', onZoom);
      window.removeEventListener('rtlbench:wave-zoom', onZoom);
    };
  }, [controls.setViewport, controls.viewport, data]);
}

function useWaveformActions(data: VcdData | null, controls: Controls, derived: Derived) {
  const zoom = (factor: number) => {
    if (!data) return;
    const fullEnd = Math.max(1, data.endTime),
      span = controls.viewport.end - controls.viewport.start;
    const nextSpan = Math.max(1, Math.min(fullEnd, span * factor));
    const start = Math.max(
      0,
      Math.min(
        fullEnd - nextSpan,
        (controls.viewport.start + controls.viewport.end) / 2 - nextSpan / 2,
      ),
    );
    controls.setViewport({ start, end: start + nextSpan });
  };
  const reorder = (targetKey: string) => {
    if (!controls.dragKey.current || controls.dragKey.current === targetKey) return;
    controls.setViews((current) => {
      const source = current.findIndex((view) => view.key === controls.dragKey.current),
        target = current.findIndex((view) => view.key === targetKey);
      if (source < 0 || target < 0) return current;
      const next = [...current],
        [moved] = next.splice(source, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };
  const applyGroup = () => {
    const name = controls.groupName.trim();
    if (!name) return;
    controls.setViews((current) =>
      current.map((view) => (view.selected ? { ...view, group: name, selected: false } : view)),
    );
    controls.setGroupName('');
  };
  const jumpEdge = (direction: -1 | 1) => {
    const selected = controls.views.find((view) => view.selected);
    const signal = selected
      ? derived.signalMap.get(selected.key)
      : derived.visibleSignals[0]?.signal;
    if (!signal) return;
    const next = adjacentTransitionTime(signal.changes, controls.cursor, direction);
    if (next !== undefined) controls.setCursor(next);
  };
  return { zoom, reorder, applyGroup, jumpEdge };
}

type Actions = ReturnType<typeof useWaveformActions>;

function EmptyWaveform({
  runs,
  onLoadRun,
}: {
  runs: SimulationRun[];
  onLoadRun?: Props['onLoadRun'];
}) {
  return (
    <div className="wave-empty">
      <div className="chip">VCD</div>
      <h1>No waveform loaded</h1>
      <p>Run a simulation, or reopen a recent trace without rerunning the design.</p>
      {runs.length > 0 && (
        <div className="recent-waveforms">
          <strong>Recent traces</strong>
          {runs.slice(0, 4).map((run) => (
            <button
              key={run.id}
              disabled={run.loading}
              onClick={() => void onLoadRun?.(run.id, true)}
            >
              <span>{run.loading ? 'Loading…' : run.name}</span>
              <small>{formatFileSize(run.size || 0)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WaveformToolbar({
  data,
  name,
  breakpoints,
  controls,
  derived,
  actions,
}: {
  data: VcdData;
  name: string | null;
  breakpoints: WaveBreakpoint[];
  controls: Controls;
  derived: Derived;
  actions: Actions;
}) {
  return (
    <div className="wave-toolbar">
      <strong>{name}</strong>
      <span>{data.signals.length} signals</span>
      <span>{data.timestampCount.toLocaleString()} timestamps</span>
      <span>Timescale {data.timescale}</span>
      {breakpoints.length > 0 && (
        <span className="breakpoint-count">
          {breakpoints.length} compiled stop{breakpoints.length === 1 ? '' : 's'}
        </span>
      )}
      <input
        aria-label="Search signals"
        placeholder="Signal or hierarchy"
        value={controls.search}
        onChange={(event) => controls.setSearch(event.target.value)}
      />
      <select
        aria-label="Signal set"
        value={controls.preset}
        onChange={(event) => controls.setPreset(event.target.value as SignalPreset)}
      >
        <option value="all">All signals</option>
        <option value="essentials">Key signals</option>
        <option value="clocks-resets">Clocks & resets</option>
        <option value="selected">Selected only</option>
      </select>
      <select
        value={controls.groupFilter}
        onChange={(event) => controls.setGroupFilter(event.target.value)}
      >
        {derived.groups.map((group) => (
          <option key={group}>{group}</option>
        ))}
      </select>
      <button onClick={() => actions.zoom(0.5)}>Zoom +</button>
      <button onClick={() => actions.zoom(2)}>Zoom −</button>
      <button onClick={() => controls.setViewport({ start: 0, end: Math.max(1, data.endTime) })}>
        Full
      </button>
      <button
        className={controls.advancedTools ? 'active' : ''}
        onClick={() => controls.setAdvancedTools((value) => !value)}
      >
        {controls.advancedTools ? 'Hide' : 'Show'} advanced tools
      </button>
    </div>
  );
}

function AdvancedWaveformTools({
  data,
  runs,
  onLoadRun,
  controls,
  derived,
  actions,
}: {
  data: VcdData;
  runs: SimulationRun[];
  onLoadRun?: Props['onLoadRun'];
  controls: Controls;
  derived: Derived;
  actions: Actions;
}) {
  return (
    <>
      <GroupToolbar controls={controls} actions={actions} />
      <MeasurementToolbar
        data={data}
        runs={runs}
        onLoadRun={onLoadRun}
        controls={controls}
        derived={derived}
        actions={actions}
      />
    </>
  );
}

function GroupToolbar({ controls, actions }: { controls: Controls; actions: Actions }) {
  return (
    <div className="group-toolbar">
      <span>Group selected:</span>
      <input
        placeholder="Group name"
        value={controls.groupName}
        onChange={(event) => controls.setGroupName(event.target.value)}
      />
      <button
        disabled={!controls.groupName.trim() || !controls.views.some((view) => view.selected)}
        onClick={actions.applyGroup}
      >
        Apply
      </button>
      <span className="hint">Wheel: zoom · Shift+wheel: pan · Click trace: cursor</span>
    </div>
  );
}

function MeasurementToolbar({
  data,
  runs,
  onLoadRun,
  controls,
  actions,
}: {
  data: VcdData;
  runs: SimulationRun[];
  onLoadRun?: Props['onLoadRun'];
  controls: Controls;
  derived: Derived;
  actions: Actions;
}) {
  const delta = controls.cursorB === null ? null : Math.abs(controls.cursorB - controls.cursor);
  const frequency = frequencyLabel(delta, data.timescale);
  return (
    <div className="measurement-toolbar">
      <button
        className={controls.activeCursor === 'A' ? 'active' : ''}
        onClick={() => controls.setActiveCursor('A')}
      >
        Place A
      </button>
      <button
        className={controls.activeCursor === 'B' ? 'active' : ''}
        onClick={() => controls.setActiveCursor('B')}
      >
        Place B
      </button>
      <span className="measurement-readout">
        A {formatSimulationTime(controls.cursor, data.timescale)}
        {controls.cursorB !== null && (
          <>
            {' '}
            · B {formatSimulationTime(controls.cursorB, data.timescale)} · Δ{' '}
            {formatSimulationTime(delta!, data.timescale)}
            {frequency && ` · ${frequency}`}
          </>
        )}
      </span>
      <button
        title="Previous transition on the first selected signal"
        onClick={() => actions.jumpEdge(-1)}
      >
        ← edge
      </button>
      <button
        title="Next transition on the first selected signal"
        onClick={() => actions.jumpEdge(1)}
      >
        edge →
      </button>
      <label>
        <input
          type="checkbox"
          checked={controls.changedOnly}
          onChange={(event) => controls.setChangedOnly(event.target.checked)}
        />{' '}
        Changed here
      </label>
      <BookmarkControls controls={controls} timescale={data.timescale} />
      <RunComparison data={data} runs={runs} controls={controls} onLoadRun={onLoadRun} />
    </div>
  );
}

function BookmarkControls({ controls, timescale }: { controls: Controls; timescale: string }) {
  const add = () => {
    controls.setBookmarks((current) => [
      ...current,
      {
        time: controls.cursor,
        label: controls.bookmarkName.trim() || `Time ${Math.round(controls.cursor)}`,
      },
    ]);
    controls.setBookmarkName('');
  };
  return (
    <>
      <input
        aria-label="Bookmark name"
        placeholder="Bookmark name"
        value={controls.bookmarkName}
        onChange={(event) => controls.setBookmarkName(event.target.value)}
      />
      <button onClick={add}>Add mark</button>
      {controls.bookmarks.length > 0 && (
        <select
          aria-label="Jump to bookmark"
          defaultValue=""
          onChange={(event) => {
            const mark = controls.bookmarks[Number(event.target.value)];
            if (mark) controls.setCursor(mark.time);
            event.target.value = '';
          }}
        >
          <option value="">Bookmarks ({controls.bookmarks.length})</option>
          {controls.bookmarks.map((mark, index) => (
            <option key={`${mark.time}-${index}`} value={index}>
              {mark.label} · {formatSimulationTime(mark.time, timescale)}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

function RunComparison({
  data,
  runs,
  controls,
  onLoadRun,
}: {
  data: VcdData;
  runs: SimulationRun[];
  controls: Controls;
  onLoadRun?: Props['onLoadRun'];
}) {
  const select = (runId: string) => {
    controls.setCompareRunId(runId);
    const run = runs.find((item) => item.id === runId);
    if (runId && run && !run.data && !run.loading) void onLoadRun?.(runId);
  };
  return (
    <select
      aria-label="Compare with earlier run"
      value={controls.compareRunId}
      onChange={(event) => select(event.target.value)}
    >
      <option value="">Compare run…</option>
      {runs
        .filter((run) => run.data !== data)
        .map((run) => (
          <option key={run.id} value={run.id}>
            {run.loading ? 'Loading… ' : ''}
            {run.name} · {new Date(run.createdAt).toLocaleTimeString()}
          </option>
        ))}
    </select>
  );
}

function WaveformGrid(
  props: Props & { data: VcdData; controls: Controls; derived: Derived; actions: Actions },
) {
  const { controls, derived } = props;
  return (
    <div
      className="wave-grid"
      ref={controls.gridRef}
      onScroll={(event) => controls.setScrollTop(event.currentTarget.scrollTop)}
    >
      <WaveformSignalList
        breakpoints={props.breakpoints}
        breakpointSupported={props.breakpointSupported}
        breakpointValue={controls.breakpointValue}
        compareByPath={derived.compareByPath}
        cursor={controls.cursor}
        dragKey={controls.dragKey}
        editingBreakpoint={controls.editingBreakpoint}
        logicHelp={controls.logicHelp}
        onBreakpointsChange={props.onBreakpointsChange}
        onDrop={props.actions.reorder}
        onSignalNavigate={props.onSignalNavigate}
        probeSignal={props.probeSignal}
        setBreakpointValue={controls.setBreakpointValue}
        setEditingBreakpoint={controls.setEditingBreakpoint}
        setLogicHelp={controls.setLogicHelp}
        setViews={controls.setViews}
        timescale={props.data.timescale}
        totalSignals={derived.visibleSignals.length}
        virtualRange={derived.virtualRange}
      />
      <div
        className="wave-canvas-scroll"
        style={{ height: HEADER_HEIGHT + derived.visibleSignals.length * ROW_HEIGHT }}
      >
        <canvas
          ref={controls.canvasRef}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const next =
              controls.viewport.start +
              ((event.clientX - rect.left) / rect.width) *
                (controls.viewport.end - controls.viewport.start);
            const bounded = Math.max(0, Math.min(props.data.endTime, next));
            if (controls.activeCursor === 'B') controls.setCursorB(bounded);
            else controls.setCursor(bounded);
          }}
        />
      </div>
    </div>
  );
}

function matchesPreset(signal: VcdSignal, view: SignalView, preset: SignalPreset) {
  if (preset === 'all') return true;
  if (preset === 'selected') return view.selected;
  const name = signal.path.toLowerCase(),
    clockOrReset = /(?:^|[._])(?:clk|clock|rst|reset)(?:$|[._[])/.test(name);
  if (preset === 'clocks-resets') return clockOrReset;
  return (
    clockOrReset ||
    /(?:pc|program_counter|instruction|opcode|state|address|data|result|valid|ready|enable|halt)/.test(
      name,
    )
  );
}

function frequencyLabel(delta: number | null, timescale: string) {
  const match = timescale.match(/([\d.]+)\s*(s|ms|us|ns|ps|fs)/i);
  const units: Record<string, number> = {
    s: 1,
    ms: 1e-3,
    us: 1e-6,
    ns: 1e-9,
    ps: 1e-12,
    fs: 1e-15,
  };
  const frequency =
    delta && match ? 1 / (delta * Number(match[1]) * units[match[2].toLowerCase()]) : null;
  if (!frequency) return '';
  if (frequency >= 1e9) return `${(frequency / 1e9).toFixed(3)} GHz`;
  if (frequency >= 1e6) return `${(frequency / 1e6).toFixed(3)} MHz`;
  if (frequency >= 1e3) return `${(frequency / 1e3).toFixed(3)} kHz`;
  return `${frequency.toFixed(3)} Hz`;
}

function formatFileSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
