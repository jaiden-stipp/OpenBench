import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { VcdData, VcdSignal } from './vcdParser.js';
import { formatVcdValue, valueAt } from './vcdParser.js';
import { sampleVisibleChanges } from './waveformMath.js';

type Radix = 'bin' | 'hex' | 'dec';
type SignalView = { key: string; radix: Radix; group: string; selected: boolean };
type VisibleSignal = SignalView & { signal: VcdSignal };

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 30;

function drawWaveforms(canvas: HTMLCanvasElement, signals: VisibleSignal[], data: VcdData, viewStart: number, viewEnd: number, cursor: number, theme: 'dark' | 'light') {
  const width = canvas.clientWidth;
  const cssHeight = Math.max(canvas.parentElement?.clientHeight || 0, HEADER_HEIGHT + signals.length * ROW_HEIGHT);
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.style.height = `${cssHeight}px`;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, cssHeight);
  const light = theme === 'light';
  context.fillStyle = light ? '#f7f9fc' : '#0a0f15';
  context.fillRect(0, 0, width, cssHeight);
  const span = Math.max(1, viewEnd - viewStart);
  const xForTime = (time: number) => ((time - viewStart) / span) * width;

  context.font = "10px 'Cascadia Code', Consolas, monospace";
  context.textBaseline = 'middle';
  for (let grid = 0; grid <= 10; grid += 1) {
    const x = (grid / 10) * width;
    const time = Math.round(viewStart + (grid / 10) * span);
    context.strokeStyle = grid % 5 === 0 ? (light ? '#bdc9d8' : '#263449') : (light ? '#e1e7ef' : '#182331');
    context.beginPath();
    context.moveTo(x + 0.5, HEADER_HEIGHT);
    context.lineTo(x + 0.5, cssHeight);
    context.stroke();
    context.fillStyle = light ? '#52657a' : '#7f93aa';
    context.fillText(`${time}`, Math.min(width - 56, x + 4), 14);
  }
  context.fillStyle = light ? '#6b7c91' : '#52657a';
  context.fillText(data.timescale, 5, 26);

  signals.forEach(({ signal, radix }, row) => {
    const top = HEADER_HEIGHT + row * ROW_HEIGHT;
    const center = top + ROW_HEIGHT / 2;
    context.fillStyle = row % 2 ? (light ? '#f1f5f9' : '#0d141d') : (light ? '#fafcff' : '#0a1017');
    context.fillRect(0, top, width, ROW_HEIGHT);
    const changes = sampleVisibleChanges(signal.changes, viewStart, viewEnd, Math.max(1, Math.floor(width)));
    if (!changes.length) return;
    let index = 0;
    context.strokeStyle = signal.width === 1 ? (light ? '#087f68' : '#55d8b7') : (light ? '#1769aa' : '#62a8ff');
    context.fillStyle = light ? '#155b96' : '#9bc8ff';
    context.lineWidth = 1.25;
    context.beginPath();
    while (index < changes.length) {
      const [time, rawValue] = changes[index];
      if (time > viewEnd) break;
      const nextTime = changes[index + 1]?.[0] ?? viewEnd;
      const x = Math.max(0, xForTime(Math.max(time, viewStart)));
      const nextX = Math.min(width, xForTime(Math.min(nextTime, viewEnd)));
      if (signal.width === 1) {
        const normalized = rawValue.toLowerCase();
        const y = normalized === '1' ? top + 6 : normalized === '0' ? top + ROW_HEIGHT - 6 : center;
        if (index > 0) context.lineTo(x, y);
        else context.moveTo(x, y);
        context.lineTo(nextX, y);
      } else {
        context.moveTo(x, center);
        context.lineTo(nextX, center);
        if (index > 0) {
          context.moveTo(x - 3, center - 6);
          context.lineTo(x + 3, center + 6);
          context.moveTo(x - 3, center + 6);
          context.lineTo(x + 3, center - 6);
        }
        if (nextX - x > 42) {
          const label = formatVcdValue(rawValue, signal.width, radix);
          context.fillText(label.length > 14 ? `${label.slice(0, 13)}…` : label, x + 6, center - 8);
        }
      }
      index += 1;
    }
    context.stroke();
  });

  const cursorX = xForTime(cursor);
  if (cursorX >= 0 && cursorX <= width) {
    context.strokeStyle = '#ffcb6b';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(cursorX + 0.5, 0);
    context.lineTo(cursorX + 0.5, cssHeight);
    context.stroke();
    context.fillStyle = '#ffcb6b';
    context.fillRect(Math.min(cursorX + 4, width - 70), 3, 66, 18);
    context.fillStyle = '#17120a';
    context.fillText(`${Math.round(cursor)}`, Math.min(cursorX + 8, width - 66), 12);
  }
}

export default function WaveformPanel({ data, name, probeSignal, onSignalNavigate, theme = 'dark', breakpoints, onBreakpointsChange, breakpointSupported, initialSession, onSessionChange }: { data: VcdData | null; name: string | null; probeSignal?: string | null; onSignalNavigate?: (signal: VcdSignal) => void; theme?: 'dark' | 'light'; breakpoints: WaveBreakpoint[]; onBreakpointsChange: (breakpoints: WaveBreakpoint[]) => void; breakpointSupported: boolean; initialSession?: WaveformSession | null; onSessionChange?: (session: WaveformSession) => void }) {
  const [views, setViews] = useState<SignalView[]>([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('All groups');
  const [groupName, setGroupName] = useState('');
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [editingBreakpoint, setEditingBreakpoint] = useState<string | null>(null);
  const [breakpointValue, setBreakpointValue] = useState('1');
  const [logicHelp, setLogicHelp] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragKey = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const defaults = data.signals.map((signal) => ({ key: signal.key, radix: signal.width > 4 ? 'hex' as const : 'bin' as const, group: signal.scope || 'Top', selected: false }));
    const restored = new Map(initialSession?.views.map((view) => [view.key, view]) || []);
    setViews(defaults.map((view) => restored.has(view.key) ? { ...view, ...restored.get(view.key)! } : view).sort((a, b) => (initialSession?.views.findIndex((view) => view.key === a.key) ?? 9999) - (initialSession?.views.findIndex((view) => view.key === b.key) ?? 9999)));
    const fullEnd = Math.max(1, data.endTime);
    setSearch(initialSession?.search || '');
    setGroupFilter(initialSession?.groupFilter || 'All groups');
    setViewStart(Math.max(0, Math.min(fullEnd - 1, initialSession?.viewStart ?? 0)));
    setViewEnd(Math.max(1, Math.min(fullEnd, initialSession?.viewEnd ?? fullEnd)));
    setCursor(Math.max(0, Math.min(fullEnd, initialSession?.cursor ?? 0)));
  }, [data]);

  useEffect(() => {
    if (!data || !views.length) return;
    const timer = setTimeout(() => onSessionChange?.({ views, search, groupFilter, viewStart, viewEnd, cursor }), 100);
    return () => clearTimeout(timer);
  }, [cursor, data, groupFilter, onSessionChange, search, viewEnd, viewStart, views]);

  useEffect(() => {
    if (!probeSignal) return;
    setSearch(probeSignal.replace(/^\\/, '').replace(/\s*\[[^\]]+\]\s*$/, '').split('.').at(-1) || probeSignal);
    setGroupFilter('All groups');
  }, [probeSignal]);

  const signalMap = useMemo(() => new Map(data?.signals.map((signal) => [signal.key, signal]) || []), [data]);
  const groups = useMemo(() => ['All groups', ...Array.from(new Set(views.map((view) => view.group)))], [views]);
  const visibleSignals = useMemo<VisibleSignal[]>(() => views.flatMap((view) => {
    const signal = signalMap.get(view.key);
    if (!signal || !signal.path.toLowerCase().includes(search.toLowerCase())) return [];
    if (groupFilter !== 'All groups' && view.group !== groupFilter) return [];
    return [{ ...view, signal }];
  }), [views, signalMap, search, groupFilter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const redraw = () => drawWaveforms(canvas, visibleSignals, data, viewStart, viewEnd, cursor, theme);
    redraw();
    const observer = new ResizeObserver(redraw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [data, visibleSignals, viewStart, viewEnd, cursor, theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const fullEnd = Math.max(1, data.endTime);
      const span = Math.max(1, viewEnd - viewStart);
      if (event.shiftKey) {
        const delta = span * Math.sign(event.deltaY) * 0.12;
        const start = Math.max(0, Math.min(fullEnd - span, viewStart + delta));
        setViewStart(start);
        setViewEnd(start + span);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const anchor = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const nextSpan = Math.max(1, Math.min(fullEnd, span * Math.exp(event.deltaY * 0.0015)));
      let start = viewStart + span * anchor - nextSpan * anchor;
      start = Math.max(0, Math.min(fullEnd - nextSpan, start));
      setViewStart(start);
      setViewEnd(start + nextSpan);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [data, viewStart, viewEnd]);

  useEffect(() => {
    const onZoom = (event: Event) => {
      if (!data) return;
      const factor = (event as CustomEvent<number>).detail;
      const fullEnd = Math.max(1, data.endTime);
      const span = viewEnd - viewStart;
      const nextSpan = Math.max(1, Math.min(fullEnd, span * factor));
      const center = (viewStart + viewEnd) / 2;
      const start = Math.max(0, Math.min(fullEnd - nextSpan, center - nextSpan / 2));
      setViewStart(start);
      setViewEnd(start + nextSpan);
    };
    window.addEventListener('rtlbench:wave-zoom', onZoom);
    return () => window.removeEventListener('rtlbench:wave-zoom', onZoom);
  }, [data, viewEnd, viewStart]);

  if (!data) return <div className="wave-empty"><div className="chip">VCD</div><h1>No waveform loaded</h1><p>Run a simulation to generate a real trace.</p></div>;

  const zoom = (factor: number) => {
    const fullEnd = Math.max(1, data.endTime);
    const span = viewEnd - viewStart;
    const nextSpan = Math.max(1, Math.min(fullEnd, span * factor));
    const center = (viewStart + viewEnd) / 2;
    const start = Math.max(0, Math.min(fullEnd - nextSpan, center - nextSpan / 2));
    setViewStart(start);
    setViewEnd(start + nextSpan);
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
    setViews((current) => current.map((view) => view.selected ? { ...view, group: cleanName, selected: false } : view));
    setGroupName('');
  };

  return (
    <div className="waveform-panel">
      <div className="wave-toolbar">
        <strong>{name}</strong><span>{data.signals.length} signals</span><span>{data.timestampCount.toLocaleString()} timestamps</span>{breakpoints.length > 0 && <span className="breakpoint-count">{breakpoints.length} compiled stop{breakpoints.length === 1 ? '' : 's'}</span>}
        <input aria-label="Search signals" placeholder="Search signals" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>{groups.map((group) => <option key={group}>{group}</option>)}</select>
        <button onClick={() => zoom(0.5)}>Zoom +</button><button onClick={() => zoom(2)}>Zoom −</button>
        <button onClick={() => { setViewStart(0); setViewEnd(Math.max(1, data.endTime)); }}>Full</button>
      </div>
      <div className="group-toolbar">
        <span>Group selected:</span><input placeholder="Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
        <button disabled={!groupName.trim() || !views.some((view) => view.selected)} onClick={applyGroup}>Apply</button>
        <span className="hint">Wheel: zoom · Shift+wheel: pan · Click trace: cursor</span>
      </div>
      <div className="wave-grid">
        <div className="signal-list">
          <div className="signal-header"><span>Signal</span><span>Value @ {Math.round(cursor)}</span></div>
          {visibleSignals.map((view) => {
            const rawValue = valueAt(view.signal.changes, cursor);
            const probed = probeSignal && view.signal.path.toLowerCase().includes(probeSignal.replace(/^\\/, '').replace(/\s*\[[^\]]+\]\s*$/, '').toLowerCase());
            const breakpoint = breakpoints.find((item) => item.signalPath === view.signal.path);
            const hasUnknown = /[xz]/i.test(rawValue);
            return <Fragment key={view.key}><div className={`signal-row ${probed ? 'probed' : ''}`} draggable onDragStart={() => { dragKey.current = view.key; }} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(view.key)}>
              <input type="checkbox" checked={view.selected} onChange={(event) => setViews((current) => current.map((item) => item.key === view.key ? { ...item, selected: event.target.checked } : item))} />
              <button className="signal-name" title={`${view.signal.path} — open declaration`} onClick={() => onSignalNavigate?.(view.signal)}><span>{view.signal.path}</span><small>{view.group}</small></button>
              <select value={view.radix} onChange={(event) => setViews((current) => current.map((item) => item.key === view.key ? { ...item, radix: event.target.value as Radix } : item))}><option value="bin">bin</option><option value="hex">hex</option><option value="dec">dec</option></select>
              <code title={hasUnknown ? 'X means unknown (often uninitialized or conflicting drivers). Z means high impedance (nothing is actively driving the signal).' : undefined}>{formatVcdValue(rawValue, view.signal.width, view.radix)}</code>
              {hasUnknown ? <button className="logic-help-button" title="Explain this X/Z value" onClick={() => setLogicHelp((value) => value === view.key ? null : view.key)}>?</button> : <span />}
              <button className={`breakpoint-button ${breakpoint ? 'active' : ''}`} disabled={!breakpointSupported} title={breakpointSupported ? breakpoint ? `Stop condition: ${view.signal.path} == ${breakpoint.value}` : 'Compile a stop condition for this signal into the next simulation' : 'Signal stop conditions currently require the Icarus backend'} onClick={() => { setEditingBreakpoint(view.key); setBreakpointValue(breakpoint?.value || '1'); }}>●</button>
            </div>
            {logicHelp === view.key && <div className="logic-explanation"><strong>{rawValue.toLowerCase().includes('x') ? 'X = unknown' : 'Z = high impedance'}</strong><span>{rawValue.toLowerCase().includes('x') ? 'A value has not been initialized, not all branches assign it, or multiple drivers disagree. Reset/state initialization is the first place to check.' : 'No source is actively driving this net. This is intentional for shared buses, but often signals a disconnected port in beginner designs.'}</span></div>}
            {editingBreakpoint === view.key && <div className="breakpoint-editor"><span>Stop next Icarus run when <code>{view.signal.path}</code> equals</span><input autoFocus value={breakpointValue} onChange={(event) => setBreakpointValue(event.target.value)} placeholder="3, 0b11, or 0x3" /><button onClick={() => { onBreakpointsChange([...breakpoints.filter((item) => item.signalPath !== view.signal.path), { signalPath: view.signal.path, width: view.signal.width, value: breakpointValue.trim() || '0' }]); setEditingBreakpoint(null); }}>Set</button>{breakpoint && <button onClick={() => { onBreakpointsChange(breakpoints.filter((item) => item.signalPath !== view.signal.path)); setEditingBreakpoint(null); }}>Remove</button>}<button onClick={() => setEditingBreakpoint(null)}>Cancel</button><small>This becomes a real simulator monitor; OpenBench does not poll or repeatedly rerun.</small></div>}
            </Fragment>;
          })}
          {!visibleSignals.length && <div className="signal-none">No signals match this filter.</div>}
        </div>
        <div className="wave-canvas-scroll"><canvas ref={canvasRef} onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const next = viewStart + ((event.clientX - rect.left) / rect.width) * (viewEnd - viewStart);
          setCursor(Math.max(0, Math.min(data.endTime, next)));
        }} /></div>
      </div>
    </div>
  );
}
