import { useState, type ReactNode } from 'react';
import type { YosysNetlist } from './netlistGraph.js';
import type { ProjectAnalysis } from './projectInsights.js';

type Insight = { severity: string; title: string; detail: string };
type Tab = 'health' | 'hierarchy' | 'learn' | 'accessibility' | 'support';
type Accessibility = { highContrast: boolean; largeText: boolean; reduceMotion: boolean };
type Props = {
  project: ProjectData;
  settings: ProjectSettings;
  insights: ProjectAnalysis;
  waveformInsights: Insight[];
  netlist: YosysNetlist | null;
  rtlTop: string | null;
  consoleText: string;
  accessibility: Accessibility;
  onAccessibility: (value: Accessibility) => void;
  onClose: () => void;
  onSaveSettings: (settings: ProjectSettings) => Promise<void>;
  onOpenModule: (name: string) => void;
  onOpenLearningProject: (id: string) => Promise<void>;
};

export default function GuidanceCenter(props: Props) {
  const [tab, setTab] = useState<Tab>('health');
  const [message, setMessage] = useState('');
  return (
    <div className="modal-backdrop guidance-backdrop">
      <section
        className="guidance-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guidance-title"
      >
        <GuidanceHeader onClose={props.onClose} />
        <GuidanceTabs tab={tab} onChange={setTab} />
        <div className="guidance-content">
          <GuidanceContent {...props} tab={tab} setMessage={setMessage} />
        </div>
        <footer>
          <span>{message}</span>
          <button onClick={props.onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

function GuidanceHeader({ onClose }: { onClose: () => void }) {
  return (
    <header>
      <div>
        <small>PROJECT</small>
        <h2 id="guidance-title">Project Guide</h2>
      </div>
      <button aria-label="Close" onClick={onClose}>
        ×
      </button>
    </header>
  );
}

function GuidanceTabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: Array<[Tab, string]> = [
    ['health', 'Health'],
    ['hierarchy', 'Hierarchy'],
    ['learn', 'Learn'],
    ['accessibility', 'Accessibility'],
    ['support', 'Support'],
  ];
  return (
    <nav aria-label="Guidance sections">
      {tabs.map(([id, label]) => (
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

function GuidanceContent(props: Props & { tab: Tab; setMessage: (message: string) => void }) {
  if (props.tab === 'health') return <HealthTab {...props} />;
  if (props.tab === 'hierarchy') return <HierarchyTab {...props} />;
  if (props.tab === 'learn') return <LearnTab onOpen={props.onOpenLearningProject} />;
  if (props.tab === 'accessibility')
    return <AccessibilityTab value={props.accessibility} onChange={props.onAccessibility} />;
  return <SupportTab consoleText={props.consoleText} setMessage={props.setMessage} />;
}

function HealthTab({
  project,
  settings,
  insights,
  waveformInsights,
  onSaveSettings,
  setMessage,
}: Props & { setMessage: (message: string) => void }) {
  const [health, setHealth] = useState<{
    ok: boolean;
    durationMs: number;
    error?: string;
    tools: Record<string, string>;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const items = [...(insights?.issues || []), ...waveformInsights];
  const status = items.some((item) => item.severity === 'error')
    ? 'Action needed'
    : items.some((item) => item.severity === 'warning')
      ? 'Ready with suggestions'
      : 'Project looks ready';
  const applySuggestions = async () => {
    await onSaveSettings({
      ...settings,
      topModule: settings.topModule || insights.suggestedTop,
      simulationTop: settings.simulationTop || insights.suggestedSimulationTop,
    });
    setMessage('Suggested top modules saved.');
  };
  const runSelfTest = async () => {
    setChecking(true);
    setHealth(await window.rtldeck.runToolchainSelfTest());
    setChecking(false);
  };
  return (
    <>
      <div className="health-summary">
        <strong>{status}</strong>
        <span>
          {project.files.length} files · {insights?.modules?.length || 0} modules ·{' '}
          {settings.simulator}
        </span>
      </div>
      <SuggestedSetup settings={settings} insights={insights} onApply={applySuggestions} />
      <InsightList items={items} />
      <div className="health-action">
        <span>
          <strong>Bundled toolchain self-test</strong>
          <small>Checks the bundled simulator and RTL tools with a small design.</small>
        </span>
        <button disabled={checking} onClick={() => void runSelfTest()}>
          {checking ? 'Testing…' : 'Run self-test'}
        </button>
      </div>
      {health && <ToolHealth health={health} />}
    </>
  );
}

function SuggestedSetup({
  settings,
  insights,
  onApply,
}: {
  settings: ProjectSettings;
  insights: ProjectAnalysis;
  onApply: () => Promise<void>;
}) {
  if (
    !(insights?.suggestedTop || insights?.suggestedSimulationTop) ||
    (settings.topModule && settings.simulationTop)
  )
    return null;
  return (
    <div className="health-action">
      <span>
        <strong>Hierarchy-based setup</strong>
        <small>
          Design: {insights.suggestedTop || 'not found'} · Testbench:{' '}
          {insights.suggestedSimulationTop || 'not found'}
        </small>
      </span>
      <button onClick={() => void onApply()}>Fill missing selections</button>
    </div>
  );
}

function InsightList({ items }: { items: Insight[] }) {
  if (!items.length)
    return (
      <div className="insight-list">
        <article className="ok">
          <i>✓</i>
          <span>
            <strong>No common setup problems detected</strong>
            <small>Compile or run RTL Analysis to validate the project.</small>
          </span>
        </article>
      </div>
    );
  return (
    <div className="insight-list">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`} className={item.severity}>
          <i>{item.severity === 'error' ? '!' : item.severity === 'warning' ? '△' : 'i'}</i>
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
        </article>
      ))}
    </div>
  );
}

function ToolHealth({
  health,
}: {
  health: { ok: boolean; durationMs: number; error?: string; tools: Record<string, string> };
}) {
  return (
    <div className={`tool-health ${health.ok ? 'ok' : 'error'}`}>
      <strong>
        {health.ok ? `Toolchain passed in ${health.durationMs} ms` : 'Toolchain self-test failed'}
      </strong>
      {health.error && <span>{health.error}</span>}
      {Object.entries(health.tools).map(([tool, result]) => (
        <span key={tool}>
          <b>{tool}</b>: {result}
        </span>
      ))}
    </div>
  );
}

function HierarchyTab({ netlist, rtlTop, onOpenModule }: Props) {
  if (!netlist || !rtlTop)
    return (
      <div className="guidance-empty">
        <strong>No elaborated hierarchy yet</strong>
        <span>Run RTL Analysis, then return here to browse modules and instances.</span>
      </div>
    );
  return (
    <>
      <p>Select a module to focus it in the RTL schematic.</p>
      <Hierarchy netlist={netlist} top={rtlTop} onOpenModule={onOpenModule} />
    </>
  );
}

function Hierarchy({
  netlist,
  top,
  onOpenModule,
}: {
  netlist: YosysNetlist;
  top: string;
  onOpenModule: (name: string) => void;
}) {
  return (
    <ul className="hierarchy-tree">
      {renderHierarchy(netlist, top, onOpenModule, 0, new Set([top]))}
    </ul>
  );
}

function renderHierarchy(
  netlist: YosysNetlist,
  name: string,
  onOpen: (name: string) => void,
  depth: number,
  seen: Set<string>,
): ReactNode {
  const modules = netlist.modules || {};
  if (!modules[name] || depth > 8) return null;
  const instances = Object.entries(modules[name].cells || {}).filter(([, cell]) =>
    Boolean(modules[cell.type]),
  );
  return (
    <li key={`${name}-${depth}`}>
      <button onClick={() => onOpen(name)}>
        <strong>{name}</strong>
        <small>
          {Object.keys(modules[name].ports || {}).length} ports ·{' '}
          {Object.keys(modules[name].cells || {}).length} blocks
        </small>
      </button>
      {instances.length > 0 && (
        <ul>
          {instances.map(([instance, cell]) => (
            <li key={instance}>
              <span>{instance.replace(/^\\/, '')}</span>
              {seen.has(cell.type) ? (
                <em>{cell.type} (recursive)</em>
              ) : (
                <ul>
                  {renderHierarchy(
                    netlist,
                    cell.type,
                    onOpen,
                    depth + 1,
                    new Set([...seen, cell.type]),
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function LearnTab({ onOpen }: { onOpen: (id: string) => Promise<void> }) {
  const lessons = [
    ['getting-started', 'Counter', 'Clock, reset, enable, and a 4-bit register'],
    ['traffic-light', 'Traffic-light FSM', 'States, transitions, and timed stimulus'],
    ['pwm', 'PWM generator', 'Counter comparison and duty cycle'],
    ['alu', 'Simple ALU', 'Combinational case logic and operations'],
  ];
  return (
    <>
      <p>Learn by editing and running a complete local project.</p>
      <div className="lesson-grid">
        {lessons.map(([id, title, description]) => (
          <article key={id}>
            <small>LESSON</small>
            <strong>{title}</strong>
            <span>{description}</span>
            <button onClick={() => void onOpen(id)}>Open lesson</button>
          </article>
        ))}
      </div>
    </>
  );
}

function AccessibilityTab({
  value,
  onChange,
}: {
  value: Accessibility;
  onChange: (value: Accessibility) => void;
}) {
  const options: Array<[keyof Accessibility, string, string]> = [
    ['highContrast', 'High contrast', 'Stronger borders, focus rings, and waveform separation.'],
    [
      'largeText',
      'Larger interface text',
      'Increases navigation, console, signal, and schematic labels.',
    ],
    ['reduceMotion', 'Reduce motion', 'Disables tutorial pulses and animated transitions.'],
  ];
  return (
    <>
      <p>These preferences apply immediately and remain enabled after restart.</p>
      <div className="accessibility-options">
        {options.map(([key, title, detail]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
            />
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function SupportTab({
  consoleText,
  setMessage,
}: {
  consoleText: string;
  setMessage: (message: string) => void;
}) {
  const [includeSource, setIncludeSource] = useState(false);
  const exportBundle = async () => {
    const saved = await window.rtldeck.exportSupportBundle({ consoleText, includeSource });
    setMessage(saved ? `Saved diagnostic bundle to ${saved}` : 'Export canceled.');
  };
  return (
    <>
      <p>
        Create a local diagnostic bundle for a bug report. Source code is excluded unless you
        explicitly opt in.
      </p>
      <label className="source-consent">
        <input
          type="checkbox"
          checked={includeSource}
          onChange={(event) => setIncludeSource(event.target.checked)}
        />
        <span>
          <strong>Include project source files</strong>
          <small>Only enable this if you have permission to share every selected HDL file.</small>
        </span>
      </label>
      <button className="export-bundle" onClick={() => void exportBundle()}>
        Save support report…
      </button>
      <div className="bundle-contents">
        <strong>Always included</strong>
        <span>RTLDeck/OS versions, project filenames, settings, and recent console output</span>
        <strong>Excluded by default</strong>
        <span>HDL contents, generated waveforms, netlists, and recovery drafts</span>
      </div>
    </>
  );
}
