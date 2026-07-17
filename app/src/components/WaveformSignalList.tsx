import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { VcdSignal } from '../vcdParser';
import { formatVcdValue, valueAt } from '../vcdParser';
import { formatSimulationTime } from '../waveformMath';
import { ROW_HEIGHT } from '../waveformRenderer';

export type Radix = 'bin' | 'hex' | 'dec';
export type SignalView = { key: string; radix: Radix; group: string; selected: boolean };
export type VisibleSignal = SignalView & { signal: VcdSignal };

type Props = {
  breakpoints: WaveBreakpoint[];
  breakpointSupported: boolean;
  breakpointValue: string;
  compareByPath: Map<string, VcdSignal>;
  cursor: number;
  dragKey: MutableRefObject<string | null>;
  editingBreakpoint: string | null;
  logicHelp: string | null;
  onBreakpointsChange: (items: WaveBreakpoint[]) => void;
  onDrop: (key: string) => void;
  onSignalNavigate?: (signal: VcdSignal) => void;
  probeSignal?: string | null;
  setBreakpointValue: Dispatch<SetStateAction<string>>;
  setEditingBreakpoint: Dispatch<SetStateAction<string | null>>;
  setLogicHelp: Dispatch<SetStateAction<string | null>>;
  setViews: Dispatch<SetStateAction<SignalView[]>>;
  timescale: string;
  totalSignals: number;
  virtualRange: { first: number; last: number; signals: VisibleSignal[] };
};

export default function WaveformSignalList(props: Props) {
  return (
    <div className="signal-list">
      <div className="signal-header">
        <span>Signal</span>
        <span>Value @ {formatSimulationTime(props.cursor, props.timescale)}</span>
      </div>
      <div style={{ height: props.virtualRange.first * ROW_HEIGHT }} aria-hidden="true" />
      {props.virtualRange.signals.map((view) => (
        <SignalSlot key={view.key} {...props} view={view} />
      ))}
      <div
        style={{ height: (props.totalSignals - props.virtualRange.last) * ROW_HEIGHT }}
        aria-hidden="true"
      />
      {!props.totalSignals && <div className="signal-none">No signals match this filter.</div>}
    </div>
  );
}

function SignalSlot(props: Props & { view: VisibleSignal }) {
  const rawValue = valueAt(props.view.signal.changes, props.cursor);
  const compared = props.compareByPath.get(props.view.signal.path);
  const comparisonValue = compared ? valueAt(compared.changes, props.cursor) : null;
  const breakpoint = props.breakpoints.find((item) => item.signalPath === props.view.signal.path);
  return (
    <div className="virtual-signal-slot">
      <SignalRow
        {...props}
        rawValue={rawValue}
        comparisonValue={comparisonValue}
        breakpoint={breakpoint}
      />
      {props.logicHelp === props.view.key && <LogicExplanation rawValue={rawValue} />}
      {props.editingBreakpoint === props.view.key && (
        <BreakpointEditor {...props} breakpoint={breakpoint} />
      )}
    </div>
  );
}

type RowProps = Props & {
  view: VisibleSignal;
  rawValue: string;
  comparisonValue: string | null;
  breakpoint?: WaveBreakpoint;
};

function SignalRow(props: RowProps) {
  const { view } = props;
  const unknown = /[xz]/i.test(props.rawValue);
  return (
    <div
      className={`signal-row ${probeMatches(props.probeSignal, view.signal.path) ? 'probed' : ''}`}
      draggable
      onDragStart={() => (props.dragKey.current = view.key)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => props.onDrop(view.key)}
    >
      <input
        type="checkbox"
        checked={view.selected}
        onChange={(event) =>
          updateView(props.setViews, view.key, { selected: event.target.checked })
        }
      />
      <button
        className="signal-name"
        title={`${view.signal.path} — open declaration`}
        onClick={() => props.onSignalNavigate?.(view.signal)}
      >
        <span>{view.signal.name || view.signal.path.split('.').at(-1) || view.signal.path}</span>
        <small title={view.signal.path}>{compactScope(view.signal.scope)}</small>
      </button>
      <select
        value={view.radix}
        onChange={(event) =>
          updateView(props.setViews, view.key, { radix: event.target.value as Radix })
        }
      >
        <option value="bin">bin</option>
        <option value="hex">hex</option>
        <option value="dec">dec</option>
      </select>
      <code title={valueTitle(props, unknown)}>
        {formatVcdValue(props.rawValue, view.signal.width, view.radix)}
        {props.comparisonValue !== null && props.comparisonValue !== props.rawValue ? ' ≠' : ''}
      </code>
      {unknown ? (
        <button
          className="logic-help-button"
          title="Explain this X/Z value"
          onClick={() => props.setLogicHelp((value) => (value === view.key ? null : view.key))}
        >
          ?
        </button>
      ) : (
        <span />
      )}
      <button
        className={`breakpoint-button ${props.breakpoint ? 'active' : ''}`}
        disabled={!props.breakpointSupported}
        title={breakpointTitle(props)}
        onClick={() => {
          props.setEditingBreakpoint(view.key);
          props.setBreakpointValue(props.breakpoint?.value || '1');
        }}
      >
        ●
      </button>
    </div>
  );
}

function BreakpointEditor(props: Props & { view: VisibleSignal; breakpoint?: WaveBreakpoint }) {
  const remaining = () =>
    props.breakpoints.filter((item) => item.signalPath !== props.view.signal.path);
  return (
    <div className="breakpoint-editor">
      <span>
        Stop next Icarus run when <code>{props.view.signal.path}</code> equals
      </span>
      <input
        autoFocus
        value={props.breakpointValue}
        onChange={(event) => props.setBreakpointValue(event.target.value)}
        placeholder="3, 0b11, or 0x3"
      />
      <button
        onClick={() => {
          props.onBreakpointsChange([
            ...remaining(),
            {
              signalPath: props.view.signal.path,
              width: props.view.signal.width,
              value: props.breakpointValue.trim() || '0',
            },
          ]);
          props.setEditingBreakpoint(null);
        }}
      >
        Set
      </button>
      {props.breakpoint && (
        <button
          onClick={() => {
            props.onBreakpointsChange(remaining());
            props.setEditingBreakpoint(null);
          }}
        >
          Remove
        </button>
      )}
      <button onClick={() => props.setEditingBreakpoint(null)}>Cancel</button>
      <small>
        This becomes a real simulator monitor; OpenBench does not poll or repeatedly rerun.
      </small>
    </div>
  );
}

function LogicExplanation({ rawValue }: { rawValue: string }) {
  const unknown = rawValue.toLowerCase().includes('x');
  return (
    <div className="logic-explanation">
      <strong>{unknown ? 'X = unknown' : 'Z = high impedance'}</strong>
      <span>
        {unknown
          ? 'A value has not been initialized, not all branches assign it, or multiple drivers disagree. Reset/state initialization is the first place to check.'
          : 'No source is actively driving this net. This is intentional for shared buses, but often signals a disconnected port in beginner designs.'}
      </span>
    </div>
  );
}

function updateView(setViews: Props['setViews'], key: string, update: Partial<SignalView>) {
  setViews((current) => current.map((item) => (item.key === key ? { ...item, ...update } : item)));
}

function valueTitle(props: RowProps, unknown: boolean) {
  if (unknown)
    return 'X means unknown (often uninitialized or conflicting drivers). Z means high impedance (nothing is actively driving the signal).';
  return props.comparisonValue === null
    ? undefined
    : `Earlier run: ${formatVcdValue(props.comparisonValue, props.view.signal.width, props.view.radix)}`;
}

function breakpointTitle(props: RowProps) {
  if (!props.breakpointSupported)
    return 'Signal stop conditions currently require the Icarus backend';
  return props.breakpoint
    ? `Stop condition: ${props.view.signal.path} == ${props.breakpoint.value}`
    : 'Compile a stop condition for this signal into the next simulation';
}

function probeMatches(probe: string | null | undefined, path: string) {
  return Boolean(
    probe &&
    path.toLowerCase().includes(
      probe
        .replace(/^\\/, '')
        .replace(/\s*\[[^\]]+\]\s*$/, '')
        .toLowerCase(),
    ),
  );
}

function compactScope(scope: string) {
  if (!scope) return 'Top';
  const parts = scope.split('.');
  return parts.length > 2 ? `…${parts.slice(-2).join('.')}` : scope;
}
