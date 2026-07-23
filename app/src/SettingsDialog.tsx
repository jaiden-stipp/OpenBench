import { useState } from 'react';

export default function SettingsDialog({
  initial,
  designModules,
  simulationModules,
  onClose,
  onSave,
}: {
  initial: ProjectSettings;
  designModules: string[];
  simulationModules: string[];
  onClose: () => void;
  onSave: (settings: ProjectSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [includeText, setIncludeText] = useState(initial.includePaths.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        includePaths: includeText
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-heading">
          <div>
            <small>PROJECT</small>
            <h2 id="settings-title">RTLDeck Settings</h2>
          </div>
          <button aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>
        <SimulatorField draft={draft} setDraft={setDraft} />
        <TopModuleFields
          draft={draft}
          setDraft={setDraft}
          designModules={designModules}
          simulationModules={simulationModules}
        />
        <div className="toolchain-ready">Bundled tools are selected automatically.</div>
        <button className="advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
          {showAdvanced ? 'Hide' : 'Show'} advanced settings
        </button>
        {showAdvanced && <AdvancedSettings {...{ draft, setDraft, includeText, setIncludeText }} />}
        {error && <div className="settings-error">{error}</div>}
        <div className="settings-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </section>
    </div>
  );
}

type DraftSetter = React.Dispatch<React.SetStateAction<ProjectSettings>>;

function SimulatorField({ draft, setDraft }: { draft: ProjectSettings; setDraft: DraftSetter }) {
  return (
    <label>
      <span>Simulator backend</span>
      <select
        value={draft.simulator}
        onChange={(event) =>
          setDraft((value) => ({
            ...value,
            simulator: event.target.value as ProjectSettings['simulator'],
          }))
        }
      >
        <option value="iverilog">Icarus Verilog</option>
        <option value="verilator">Verilator</option>
      </select>
      <small>
        {draft.simulator === 'verilator'
          ? 'Useful for strict linting. Simulation may also require a C++ build toolchain.'
          : 'Recommended for the simplest compile and simulation workflow.'}
      </small>
    </label>
  );
}

function TopModuleFields({
  draft,
  setDraft,
  designModules,
  simulationModules,
}: {
  draft: ProjectSettings;
  setDraft: DraftSetter;
  designModules: string[];
  simulationModules: string[];
}) {
  const options = (current: string, modules: string[]) =>
    [...new Set([current, ...modules].filter(Boolean))].map((name) => (
      <option key={name} value={name}>
        {name}
      </option>
    ));
  return (
    <div className="settings-columns">
      <label>
        <span>Design top module</span>
        <select
          value={draft.topModule}
          onChange={(event) => setDraft((value) => ({ ...value, topModule: event.target.value }))}
        >
          <option value="">Select a design module</option>
          {options(draft.topModule, designModules)}
        </select>
        <small>Used for RTL Analysis; no testbench is required.</small>
      </label>
      <label>
        <span>Simulation top module</span>
        <select
          value={draft.simulationTop}
          onChange={(event) =>
            setDraft((value) => ({ ...value, simulationTop: event.target.value }))
          }
        >
          <option value="">No testbench selected</option>
          {options(draft.simulationTop, simulationModules)}
        </select>
        <small>Optional. Select a testbench to enable simulation.</small>
      </label>
    </div>
  );
}

function AdvancedSettings({
  draft,
  setDraft,
  includeText,
  setIncludeText,
}: {
  draft: ProjectSettings;
  setDraft: DraftSetter;
  includeText: string;
  setIncludeText: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <div className="advanced-settings">
      <label>
        <span>Custom toolchain location</span>
        <input
          placeholder="Leave empty to use bundled tools"
          value={draft.toolchainPath}
          onChange={(event) =>
            setDraft((value) => ({ ...value, toolchainPath: event.target.value }))
          }
        />
        <small>Use this only when testing a different OSS CAD Suite installation.</small>
      </label>
      <label>
        <span>Include paths</span>
        <textarea
          rows={5}
          placeholder="One project-relative or absolute directory per line"
          value={includeText}
          onChange={(event) => setIncludeText(event.target.value)}
        />
      </label>
    </div>
  );
}
