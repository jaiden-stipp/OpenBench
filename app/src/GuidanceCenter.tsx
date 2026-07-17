import { useState } from 'react';
import type { YosysNetlist } from './netlistGraph.js';
import type { ProjectAnalysis } from './projectInsights.js';

type Insight = { severity: string; title: string; detail: string };

function Hierarchy({
  netlist,
  top,
  onOpenModule,
}: {
  netlist: YosysNetlist;
  top: string;
  onOpenModule: (name: string) => void;
}) {
  const modules = netlist.modules || {};
  const render = (name: string, depth: number, seen: Set<string>): React.ReactNode => {
    if (!modules[name] || depth > 8) return null;
    const instances = Object.entries(modules[name].cells || {}).filter(([, cell]) =>
      Boolean(modules[cell.type]),
    );
    return (
      <li key={`${name}-${depth}`}>
        <button onClick={() => onOpenModule(name)}>
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
                  <ul>{render(cell.type, depth + 1, new Set([...seen, cell.type]))}</ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };
  return <ul className="hierarchy-tree">{render(top, 0, new Set([top]))}</ul>;
}

export default function GuidanceCenter({
  project,
  settings,
  insights,
  waveformInsights,
  netlist,
  rtlTop,
  consoleText,
  accessibility,
  onAccessibility,
  onClose,
  onSaveSettings,
  onOpenModule,
  onOpenLearningProject,
}: {
  project: ProjectData;
  settings: ProjectSettings;
  insights: ProjectAnalysis;
  waveformInsights: Insight[];
  netlist: YosysNetlist | null;
  rtlTop: string | null;
  consoleText: string;
  accessibility: { highContrast: boolean; largeText: boolean; reduceMotion: boolean };
  onAccessibility: (value: {
    highContrast: boolean;
    largeText: boolean;
    reduceMotion: boolean;
  }) => void;
  onClose: () => void;
  onSaveSettings: (settings: ProjectSettings) => Promise<void>;
  onOpenModule: (name: string) => void;
  onOpenLearningProject: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'health' | 'hierarchy' | 'learn' | 'accessibility' | 'support'>(
    'health',
  );
  const [toolHealth, setToolHealth] = useState<{
    ok: boolean;
    durationMs: number;
    error?: string;
    tools: Record<string, string>;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [includeSource, setIncludeSource] = useState(false);
  const [message, setMessage] = useState('');
  const allInsights = [...(insights?.issues || []), ...waveformInsights];
  const applySuggestions = async () => {
    await onSaveSettings({
      ...settings,
      topModule: settings.topModule || insights.suggestedTop,
      simulationTop: settings.simulationTop || insights.suggestedSimulationTop,
    });
    setMessage('Suggested top modules saved.');
  };
  return (
    <div className="modal-backdrop guidance-backdrop">
      <section
        className="guidance-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guidance-title"
      >
        <header>
          <div>
            <small>PROJECT</small>
            <h2 id="guidance-title">Project Guide</h2>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <nav aria-label="Guidance sections">
          <button className={tab === 'health' ? 'active' : ''} onClick={() => setTab('health')}>
            Health
          </button>
          <button
            className={tab === 'hierarchy' ? 'active' : ''}
            onClick={() => setTab('hierarchy')}
          >
            Hierarchy
          </button>
          <button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>
            Learn
          </button>
          <button
            className={tab === 'accessibility' ? 'active' : ''}
            onClick={() => setTab('accessibility')}
          >
            Accessibility
          </button>
          <button className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}>
            Support
          </button>
        </nav>
        <div className="guidance-content">
          {tab === 'health' && (
            <>
              <div className="health-summary">
                <strong>
                  {allInsights.some((item) => item.severity === 'error')
                    ? 'Action needed'
                    : allInsights.some((item) => item.severity === 'warning')
                      ? 'Ready with suggestions'
                      : 'Project looks ready'}
                </strong>
                <span>
                  {project.files.length} files · {insights?.modules?.length || 0} modules ·{' '}
                  {settings.simulator}
                </span>
              </div>
              {(insights?.suggestedTop || insights?.suggestedSimulationTop) &&
                (!settings.topModule || !settings.simulationTop) && (
                  <div className="health-action">
                    <span>
                      <strong>Hierarchy-based setup</strong>
                      <small>
                        Design: {insights.suggestedTop || 'not found'} · Testbench:{' '}
                        {insights.suggestedSimulationTop || 'not found'}
                      </small>
                    </span>
                    <button onClick={() => void applySuggestions()}>Fill missing selections</button>
                  </div>
                )}
              <div className="insight-list">
                {allInsights.length ? (
                  allInsights.map((item, index) => (
                    <article key={`${item.title}-${index}`} className={item.severity}>
                      <i>
                        {item.severity === 'error' ? '!' : item.severity === 'warning' ? '△' : 'i'}
                      </i>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                    </article>
                  ))
                ) : (
                  <article className="ok">
                    <i>✓</i>
                    <span>
                      <strong>No common setup problems detected</strong>
                      <small>Compile or run RTL Analysis to validate the project.</small>
                    </span>
                  </article>
                )}
              </div>
              <div className="health-action">
                <span>
                  <strong>Bundled toolchain self-test</strong>
                  <small>Checks the bundled simulator and RTL tools with a small design.</small>
                </span>
                <button
                  disabled={checking}
                  onClick={async () => {
                    setChecking(true);
                    setToolHealth(await window.openbench.runToolchainSelfTest());
                    setChecking(false);
                  }}
                >
                  {checking ? 'Testing…' : 'Run self-test'}
                </button>
              </div>
              {toolHealth && (
                <div className={`tool-health ${toolHealth.ok ? 'ok' : 'error'}`}>
                  <strong>
                    {toolHealth.ok
                      ? `Toolchain passed in ${toolHealth.durationMs} ms`
                      : 'Toolchain self-test failed'}
                  </strong>
                  {toolHealth.error && <span>{toolHealth.error}</span>}
                  {Object.entries(toolHealth.tools).map(([tool, result]) => (
                    <span key={tool}>
                      <b>{tool}</b>: {result}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'hierarchy' &&
            (netlist && rtlTop ? (
              <>
                <p>Select a module to focus it in the RTL schematic.</p>
                <Hierarchy netlist={netlist} top={rtlTop} onOpenModule={onOpenModule} />
              </>
            ) : (
              <div className="guidance-empty">
                <strong>No elaborated hierarchy yet</strong>
                <span>Run RTL Analysis, then return here to browse modules and instances.</span>
              </div>
            ))}
          {tab === 'learn' && (
            <>
              <p>Learn by editing and running a complete local project.</p>
              <div className="lesson-grid">
                {[
                  ['getting-started', 'Counter', 'Clock, reset, enable, and a 4-bit register'],
                  ['traffic-light', 'Traffic-light FSM', 'States, transitions, and timed stimulus'],
                  ['pwm', 'PWM generator', 'Counter comparison and duty cycle'],
                  ['alu', 'Simple ALU', 'Combinational case logic and operations'],
                ].map(([id, title, description]) => (
                  <article key={id}>
                    <small>LESSON</small>
                    <strong>{title}</strong>
                    <span>{description}</span>
                    <button onClick={() => void onOpenLearningProject(id)}>Open lesson</button>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === 'accessibility' && (
            <>
              <p>These preferences apply immediately and remain enabled after restart.</p>
              <div className="accessibility-options">
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.highContrast}
                    onChange={(event) =>
                      onAccessibility({ ...accessibility, highContrast: event.target.checked })
                    }
                  />
                  <span>
                    <strong>High contrast</strong>
                    <small>Stronger borders, focus rings, and waveform separation.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.largeText}
                    onChange={(event) =>
                      onAccessibility({ ...accessibility, largeText: event.target.checked })
                    }
                  />
                  <span>
                    <strong>Larger interface text</strong>
                    <small>Increases navigation, console, signal, and schematic labels.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.reduceMotion}
                    onChange={(event) =>
                      onAccessibility({ ...accessibility, reduceMotion: event.target.checked })
                    }
                  />
                  <span>
                    <strong>Reduce motion</strong>
                    <small>Disables tutorial pulses and animated transitions.</small>
                  </span>
                </label>
              </div>
            </>
          )}
          {tab === 'support' && (
            <>
              <p>
                Create a local diagnostic bundle for a bug report. Source code is excluded unless
                you explicitly opt in.
              </p>
              <label className="source-consent">
                <input
                  type="checkbox"
                  checked={includeSource}
                  onChange={(event) => setIncludeSource(event.target.checked)}
                />
                <span>
                  <strong>Include project source files</strong>
                  <small>
                    Only enable this if you have permission to share every selected HDL file.
                  </small>
                </span>
              </label>
              <button
                className="export-bundle"
                onClick={async () => {
                  const saved = await window.openbench.exportSupportBundle({
                    consoleText,
                    includeSource,
                  });
                  setMessage(saved ? `Saved diagnostic bundle to ${saved}` : 'Export canceled.');
                }}
              >
                Save support report…
              </button>
              <div className="bundle-contents">
                <strong>Always included</strong>
                <span>
                  OpenBench/OS versions, project filenames, settings, and recent console output
                </span>
                <strong>Excluded by default</strong>
                <span>HDL contents, generated waveforms, netlists, and recovery drafts</span>
              </div>
            </>
          )}
        </div>
        <footer>
          <span>{message}</span>
          <button onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
