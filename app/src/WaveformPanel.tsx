import { useEffect, useMemo, useRef, useState } from 'react';
import type { VcdData, VcdSignal } from './vcdParser.js';
import { formatVcdValue, valueAt } from './vcdParser.js';
import { drawWaveforms, HEADER_HEIGHT, ROW_HEIGHT } from './waveformRenderer';
import { adjacentTransitionTime, formatSimulationTime, hasChangeInRange } from './waveformMath.js';

type Radix = 'bin' | 'hex' | 'dec';
type SignalView = { key: string; radix: Radix; group: string; selected: boolean };
type VisibleSignal = SignalView & { signal: VcdSignal };
type SignalPreset = 'all' | 'essentials' | 'clocks-resets' | 'selected';

export default function WaveformPanel({
  data,
  name,
  runs = [],
  probeSignal,
  onSignalNavigate,
  onLoadRun,
  theme = 'dark',
  displayOptions = { highContrast: false, largeText: false },
  breakpoints,
  onBreakpointsChange,
  breakpointSupported,
  initialSession,
  onSessionChange,
}: {
  data: VcdData | null;
  name: string | null;
  runs?: Array<{
    id: string;
    name: string;
    createdAt: number;
    data?: VcdData;
    files: Record<string, string>;
    fileName?: string;
    size?: number;
    loading?: boolean;
  }>;
  probeSignal?: string | null;
  onSignalNavigate?: (signal: VcdSignal) => void;
  onLoadRun?: (runId: string, open?: boolean) => Promise<void>;
  theme?: 'dark' | 'light';
  displayOptions?: { highContrast: boolean; largeText: boolean };
  breakpoints: WaveBreakpoint[];
  onBreakpointsChange: (breakpoints: WaveBreakpoint[]) => void;
  breakpointSupported: boolean;
  initialSession?: WaveformSession | null;
  onSessionChange?: (session: WaveformSession) => void;
}) {
  const [views, setViews] = useState<SignalView[]>([]);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<SignalPreset>('all');
  const [groupFilter, setGroupFilter] = useState('All groups');
  const [groupName, setGroupName] = useState('');
  const [viewport, setViewport] = useState({ start: 0, end: 1 });
  const { start: viewStart, end: viewEnd } = viewport;
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragKey = useRef<string | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const pendingViewport = useRef(viewport);
  const initialSessionRef = useRef(initialSession);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  useEffect(() => {
    pendingViewport.current = viewport;
  }, [viewport]);

  useEffect(() => {
    initialSessionRef.current = initialSession;
  }, [initialSession]);

  useEffect(() => {
    if (!data) return;
    const session = initialSessionRef.current;
    const defaults = data.signals.map((signal) => ({
      key: signal.key,
      radix: signal.width > 4 ? ('hex' as const) : ('bin' as const),
      group: signal.scope || 'Top',
      selected: false,
    }));
    const restored = new Map(session?.views.map((view) => [view.key, view]) || []);
    setViews(
      defaults
        .map((view) => (restored.has(view.key) ? { ...view, ...restored.get(view.key)! } : view))
        .sort(
          (a, b) =>
            (session?.views.findIndex((view) => view.key === a.key) ?? 9999) -
            (session?.views.findIndex((view) => view.key === b.key) ?? 9999),
        ),
    );
    const fullEnd = Math.max(1, data.endTime);
    setSearch(session?.search || '');
    setPreset(session?.preset || (data.signals.length > 32 ? 'essentials' : 'all'));
    setGroupFilter(session?.groupFilter || 'All groups');
    setViewport({
      start: Math.max(0, Math.min(fullEnd - 1, session?.viewStart ?? 0)),
      end: Math.max(1, Math.min(fullEnd, session?.viewEnd ?? fullEnd)),
    });
    setCursor(Math.max(0, Math.min(fullEnd, session?.cursor ?? 0)));
    setCursorB(session?.cursorB == null ? null : Math.max(0, Math.min(fullEnd, session.cursorB)));
    setBookmarks(session?.bookmarks || []);
  }, [data]);

  useEffect(() => {
    if (!data || !views.length) return;
    const timer = setTimeout(
      () =>
        onSessionChange?.({
          views,
          search,
          groupFilter,
          viewStart,
          viewEnd,
          cursor,
          cursorB,
          bookmarks,
          preset,
        }),
      100,
    );
    return () => clearTimeout(timer);
  }, [
    bookmarks,
    cursor,
    cursorB,
    data,
    groupFilter,
    onSessionChange,
    preset,
    search,
    viewEnd,
    viewStart,
    views,
  ]);

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
  }, [probeSignal]);

  const signalMap = useMemo(
    () => new Map(data?.signals.map((signal) => [signal.key, signal]) || []),
    [data],
  );
  const groups = useMemo(
    () => ['All groups', ...Array.from(new Set(views.map((view) => view.group)))],
    [views],
  );
  const visibleSignals = useMemo<VisibleSignal[]>(
    () =>
      views.flatMap((view) => {
        const signal = signalMap.get(view.key);
        if (!signal || !signal.path.toLowerCase().includes(search.toLowerCase())) return [];
        if (!matchesPreset(signal, view, preset)) return [];
        if (groupFilter !== 'All groups' && view.group !== groupFilter) return [];
        if (changedOnly && !hasChangeInRange(signal.changes, viewStart, viewEnd)) return [];
        return [{ ...view, signal }];
      }),
    [changedOnly, groupFilter, preset, search, signalMap, viewEnd, viewStart, views],
  );
  const virtualRange = useMemo(() => {
    const overscan = 5;
    const first = Math.max(0, Math.floor((scrollTop - HEADER_HEIGHT) / ROW_HEIGHT) - overscan);
    const last = Math.min(
      visibleSignals.length,
      Math.ceil((scrollTop + viewportHeight - HEADER_HEIGHT) / ROW_HEIGHT) + overscan,
    );
    return { first, last, signals: visibleSignals.slice(first, last) };
  }, [scrollTop, viewportHeight, visibleSignals]);

  const compareRun = runs.find((run) => run.id === compareRunId);
  const compareByPath = useMemo(
    () => new Map(compareRun?.data?.signals.map((signal) => [signal.path, signal]) || []),
    [compareRun],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    let frame = requestAnimationFrame(() =>
      drawWaveforms({
        canvas,
        signals: virtualRange.signals,
        data,
        viewStart,
        viewEnd,
        cursor,
        cursorB,
        bookmarks,
        theme,
        displayOptions,
        viewportHeight,
        rowOffset: virtualRange.first,
      }),
    );
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        drawWaveforms({
          canvas,
          signals: virtualRange.signals,
          data,
          viewStart,
          viewEnd,
          cursor,
          cursorB,
          bookmarks,
          theme,
          displayOptions,
          viewportHeight,
          rowOffset: virtualRange.first,
        }),
      );
    };
    const observer = new ResizeObserver(redraw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    bookmarks,
    cursor,
    cursorB,
    data,
    displayOptions,
    theme,
    viewEnd,
    viewStart,
    viewportHeight,
    virtualRange,
  ]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => setViewportHeight(grid.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const fullEnd = Math.max(1, data.endTime);
      const current = pendingViewport.current;
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
      pendingViewport.current = next;
      if (wheelFrame.current === null)
        wheelFrame.current = requestAnimationFrame(() => {
          wheelFrame.current = null;
          setViewport(pendingViewport.current);
        });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current = null;
    };
  }, [data]);

  useEffect(() => {
    const onZoom = (event: Event) => {
      if (!data) return;
      const factor = (event as CustomEvent<number>).detail;
      const fullEnd = Math.max(1, data.endTime);
      const span = viewEnd - viewStart;
      const nextSpan = Math.max(1, Math.min(fullEnd, span * factor));
      const center = (viewStart + viewEnd) / 2;
      const start = Math.max(0, Math.min(fullEnd - nextSpan, center - nextSpan / 2));
      setViewport({ start, end: start + nextSpan });
    };
    window.addEventListener('rtlbench:wave-zoom', onZoom);
    return () => window.removeEventListener('rtlbench:wave-zoom', onZoom);
  }, [data, viewEnd, viewStart]);

  if (!data)
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

  const zoom = (factor: number) => {
    const fullEnd = Math.max(1, data.endTime);
    const span = viewEnd - viewStart;
    const nextSpan = Math.max(1, Math.min(fullEnd, span * factor));
    const center = (viewStart + viewEnd) / 2;
    const start = Math.max(0, Math.min(fullEnd - nextSpan, center - nextSpan / 2));
    setViewport({ start, end: start + nextSpan });
  };

  const reorder = (targetKey: string) => {
    if (!dragKey.current || dragKey.current === targetKey) return;
    setViews((current) => {
      const source = current.findIndex((view) => view.key === dragKey.current);
      const target = current.findIndex((view) => view.key === targetKey);
      if (source < 0 || target < 0) return current;
      const next = [...current];
      const [moved] = next.splice(source, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const applyGroup = () => {
    const cleanName = groupName.trim();
    if (!cleanName) return;
    setViews((current) =>
      current.map((view) =>
        view.selected ? { ...view, group: cleanName, selected: false } : view,
      ),
    );
    setGroupName('');
  };

  const jumpEdge = (direction: -1 | 1) => {
    const selected = views.find((view) => view.selected);
    const signal = selected ? signalMap.get(selected.key) : visibleSignals[0]?.signal;
    if (!signal) return;
    const next = adjacentTransitionTime(signal.changes, cursor, direction);
    if (next !== undefined) setCursor(next);
  };
  const delta = cursorB === null ? null : Math.abs(cursorB - cursor);
  const timescaleMatch = data.timescale.match(/([\d.]+)\s*(s|ms|us|ns|ps|fs)/i);
  const unitSeconds: Record<string, number> = {
    s: 1,
    ms: 1e-3,
    us: 1e-6,
    ns: 1e-9,
    ps: 1e-12,
    fs: 1e-15,
  };
  const frequency =
    delta && timescaleMatch
      ? 1 / (delta * Number(timescaleMatch[1]) * unitSeconds[timescaleMatch[2].toLowerCase()])
      : null;
  const frequencyLabel = frequency
    ? frequency >= 1e9
      ? `${(frequency / 1e9).toFixed(3)} GHz`
      : frequency >= 1e6
        ? `${(frequency / 1e6).toFixed(3)} MHz`
        : frequency >= 1e3
          ? `${(frequency / 1e3).toFixed(3)} kHz`
          : `${frequency.toFixed(3)} Hz`
    : '';

  return (
    <div className="waveform-panel">
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
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Signal set"
          value={preset}
          onChange={(event) => setPreset(event.target.value as SignalPreset)}
        >
          <option value="all">All signals</option>
          <option value="essentials">Key signals</option>
          <option value="clocks-resets">Clocks & resets</option>
          <option value="selected">Selected only</option>
        </select>
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
          {groups.map((group) => (
            <option key={group}>{group}</option>
          ))}
        </select>
        <button onClick={() => zoom(0.5)}>Zoom +</button>
        <button onClick={() => zoom(2)}>Zoom −</button>
        <button
          onClick={() => {
            setViewport({ start: 0, end: Math.max(1, data.endTime) });
          }}
        >
          Full
        </button>
        <button
          className={advancedTools ? 'active' : ''}
          onClick={() => setAdvancedTools((value) => !value)}
        >
          {advancedTools ? 'Hide' : 'Show'} advanced tools
        </button>
      </div>
      {advancedTools && (
        <div className="group-toolbar">
          <span>Group selected:</span>
          <input
            placeholder="Group name"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
          />
          <button
            disabled={!groupName.trim() || !views.some((view) => view.selected)}
            onClick={applyGroup}
          >
            Apply
          </button>
          <span className="hint">Wheel: zoom · Shift+wheel: pan · Click trace: cursor</span>
        </div>
      )}
      {advancedTools && (
        <div className="measurement-toolbar">
          <button
            className={activeCursor === 'A' ? 'active' : ''}
            onClick={() => setActiveCursor('A')}
          >
            Place A
          </button>
          <button
            className={activeCursor === 'B' ? 'active' : ''}
            onClick={() => setActiveCursor('B')}
          >
            Place B
          </button>
          <span className="measurement-readout">
            A {formatSimulationTime(cursor, data.timescale)}
            {cursorB !== null && (
              <>
                {' '}
                · B {formatSimulationTime(cursorB, data.timescale)} · Δ{' '}
                {formatSimulationTime(delta!, data.timescale)}
                {frequencyLabel && ` · ${frequencyLabel}`}
              </>
            )}
          </span>
          <button
            title="Previous transition on the first selected signal"
            onClick={() => jumpEdge(-1)}
          >
            ← edge
          </button>
          <button title="Next transition on the first selected signal" onClick={() => jumpEdge(1)}>
            edge →
          </button>
          <label>
            <input
              type="checkbox"
              checked={changedOnly}
              onChange={(event) => setChangedOnly(event.target.checked)}
            />{' '}
            Changed here
          </label>
          <input
            aria-label="Bookmark name"
            placeholder="Bookmark name"
            value={bookmarkName}
            onChange={(event) => setBookmarkName(event.target.value)}
          />
          <button
            onClick={() => {
              setBookmarks((current) => [
                ...current,
                { time: cursor, label: bookmarkName.trim() || `Time ${Math.round(cursor)}` },
              ]);
              setBookmarkName('');
            }}
          >
            Add mark
          </button>
          {bookmarks.length > 0 && (
            <select
              aria-label="Jump to bookmark"
              defaultValue=""
              onChange={(event) => {
                const mark = bookmarks[Number(event.target.value)];
                if (mark) setCursor(mark.time);
                event.target.value = '';
              }}
            >
              <option value="">Bookmarks ({bookmarks.length})</option>
              {bookmarks.map((mark, index) => (
                <option key={`${mark.time}-${index}`} value={index}>
                  {mark.label} · {formatSimulationTime(mark.time, data.timescale)}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Compare with earlier run"
            value={compareRunId}
            onChange={(event) => {
              const runId = event.target.value;
              setCompareRunId(runId);
              const run = runs.find((item) => item.id === runId);
              if (runId && run && !run.data && !run.loading) void onLoadRun?.(runId);
            }}
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
        </div>
      )}
      <div
        className="wave-grid"
        ref={gridRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="signal-list">
          <div className="signal-header">
            <span>Signal</span>
            <span>Value @ {formatSimulationTime(cursor, data.timescale)}</span>
          </div>
          <div style={{ height: virtualRange.first * ROW_HEIGHT }} aria-hidden="true" />
          {virtualRange.signals.map((view) => {
            const rawValue = valueAt(view.signal.changes, cursor);
            const comparisonSignal = compareByPath.get(view.signal.path);
            const comparisonValue = comparisonSignal
              ? valueAt(comparisonSignal.changes, cursor)
              : null;
            const probed =
              probeSignal &&
              view.signal.path.toLowerCase().includes(
                probeSignal
                  .replace(/^\\/, '')
                  .replace(/\s*\[[^\]]+\]\s*$/, '')
                  .toLowerCase(),
              );
            const breakpoint = breakpoints.find((item) => item.signalPath === view.signal.path);
            const hasUnknown = /[xz]/i.test(rawValue);
            return (
              <div className="virtual-signal-slot" key={view.key}>
                <div
                  className={`signal-row ${probed ? 'probed' : ''}`}
                  draggable
                  onDragStart={() => {
                    dragKey.current = view.key;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorder(view.key)}
                >
                  <input
                    type="checkbox"
                    checked={view.selected}
                    onChange={(event) =>
                      setViews((current) =>
                        current.map((item) =>
                          item.key === view.key
                            ? { ...item, selected: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    className="signal-name"
                    title={`${view.signal.path} — open declaration`}
                    onClick={() => onSignalNavigate?.(view.signal)}
                  >
                    <span>{signalLeafName(view.signal)}</span>
                    <small title={view.signal.path}>{compactScope(view.signal.scope)}</small>
                  </button>
                  <select
                    value={view.radix}
                    onChange={(event) =>
                      setViews((current) =>
                        current.map((item) =>
                          item.key === view.key
                            ? { ...item, radix: event.target.value as Radix }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="bin">bin</option>
                    <option value="hex">hex</option>
                    <option value="dec">dec</option>
                  </select>
                  <code
                    title={
                      hasUnknown
                        ? 'X means unknown (often uninitialized or conflicting drivers). Z means high impedance (nothing is actively driving the signal).'
                        : comparisonValue !== null
                          ? `Earlier run: ${formatVcdValue(comparisonValue, view.signal.width, view.radix)}`
                          : undefined
                    }
                  >
                    {formatVcdValue(rawValue, view.signal.width, view.radix)}
                    {comparisonValue !== null && comparisonValue !== rawValue ? ' ≠' : ''}
                  </code>
                  {hasUnknown ? (
                    <button
                      className="logic-help-button"
                      title="Explain this X/Z value"
                      onClick={() =>
                        setLogicHelp((value) => (value === view.key ? null : view.key))
                      }
                    >
                      ?
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    className={`breakpoint-button ${breakpoint ? 'active' : ''}`}
                    disabled={!breakpointSupported}
                    title={
                      breakpointSupported
                        ? breakpoint
                          ? `Stop condition: ${view.signal.path} == ${breakpoint.value}`
                          : 'Compile a stop condition for this signal into the next simulation'
                        : 'Signal stop conditions currently require the Icarus backend'
                    }
                    onClick={() => {
                      setEditingBreakpoint(view.key);
                      setBreakpointValue(breakpoint?.value || '1');
                    }}
                  >
                    ●
                  </button>
                </div>
                {logicHelp === view.key && (
                  <div className="logic-explanation">
                    <strong>
                      {rawValue.toLowerCase().includes('x') ? 'X = unknown' : 'Z = high impedance'}
                    </strong>
                    <span>
                      {rawValue.toLowerCase().includes('x')
                        ? 'A value has not been initialized, not all branches assign it, or multiple drivers disagree. Reset/state initialization is the first place to check.'
                        : 'No source is actively driving this net. This is intentional for shared buses, but often signals a disconnected port in beginner designs.'}
                    </span>
                  </div>
                )}
                {editingBreakpoint === view.key && (
                  <div className="breakpoint-editor">
                    <span>
                      Stop next Icarus run when <code>{view.signal.path}</code> equals
                    </span>
                    <input
                      autoFocus
                      value={breakpointValue}
                      onChange={(event) => setBreakpointValue(event.target.value)}
                      placeholder="3, 0b11, or 0x3"
                    />
                    <button
                      onClick={() => {
                        onBreakpointsChange([
                          ...breakpoints.filter((item) => item.signalPath !== view.signal.path),
                          {
                            signalPath: view.signal.path,
                            width: view.signal.width,
                            value: breakpointValue.trim() || '0',
                          },
                        ]);
                        setEditingBreakpoint(null);
                      }}
                    >
                      Set
                    </button>
                    {breakpoint && (
                      <button
                        onClick={() => {
                          onBreakpointsChange(
                            breakpoints.filter((item) => item.signalPath !== view.signal.path),
                          );
                          setEditingBreakpoint(null);
                        }}
                      >
                        Remove
                      </button>
                    )}
                    <button onClick={() => setEditingBreakpoint(null)}>Cancel</button>
                    <small>
                      This becomes a real simulator monitor; OpenBench does not poll or repeatedly
                      rerun.
                    </small>
                  </div>
                )}
              </div>
            );
          })}
          <div
            style={{ height: (visibleSignals.length - virtualRange.last) * ROW_HEIGHT }}
            aria-hidden="true"
          />
          {!visibleSignals.length && (
            <div className="signal-none">No signals match this filter.</div>
          )}
        </div>
        <div
          className="wave-canvas-scroll"
          style={{ height: HEADER_HEIGHT + visibleSignals.length * ROW_HEIGHT }}
        >
          <canvas
            ref={canvasRef}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const next =
                viewStart + ((event.clientX - rect.left) / rect.width) * (viewEnd - viewStart);
              const bounded = Math.max(0, Math.min(data.endTime, next));
              if (activeCursor === 'B') setCursorB(bounded);
              else setCursor(bounded);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function matchesPreset(signal: VcdSignal, view: SignalView, preset: SignalPreset) {
  if (preset === 'all') return true;
  if (preset === 'selected') return view.selected;
  const name = signal.path.toLowerCase();
  const clockOrReset = /(?:^|[._])(?:clk|clock|rst|reset)(?:$|[._[])/.test(name);
  if (preset === 'clocks-resets') return clockOrReset;
  return (
    clockOrReset ||
    /(?:pc|program_counter|instruction|opcode|state|address|data|result|valid|ready|enable|halt)/.test(
      name,
    )
  );
}

function signalLeafName(signal: VcdSignal) {
  return signal.name || signal.path.split('.').at(-1) || signal.path;
}

function compactScope(scope: string) {
  if (!scope) return 'Top';
  const parts = scope.split('.');
  return parts.length > 2 ? `…${parts.slice(-2).join('.')}` : scope;
}

function formatFileSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
