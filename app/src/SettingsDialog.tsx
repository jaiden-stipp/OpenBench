import { useState } from 'react';

export default function SettingsDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: ProjectSettings;
  onClose: () => void;
  onSave: (settings: ProjectSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [includeText, setIncludeText] = useState(initial.includePaths.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <h2 id="settings-title">OpenBench Settings</h2>
          </div>
          <button aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>
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
              ? 'Lint works with the bundled backend. Simulation also requires a supported C++ compiler and Make-compatible build tool.'
              : 'Validated compile and simulation backend in this runtime.'}
          </small>
        </label>
        <label>
          <span>OSS CAD Suite folder</span>
          <input
            placeholder="Auto-detect, or C:\\tools\\oss-cad-suite"
            value={draft.toolchainPath}
            onChange={(event) =>
              setDraft((value) => ({ ...value, toolchainPath: event.target.value }))
            }
          />
          <small>
            Project-relative or absolute extracted suite folder. OpenBench also checks
            OPENBENCH_TOOLCHAIN and a suite bundled beside the app.
          </small>
        </label>
        <div className="settings-columns">
          <label>
            <span>Design top module</span>
            <input
              placeholder="Auto-detect"
              value={draft.topModule}
              onChange={(event) =>
                setDraft((value) => ({ ...value, topModule: event.target.value }))
              }
            />
            <small>Passed to Yosys `hierarchy -top`.</small>
          </label>
          <label>
            <span>Simulation top module</span>
            <input
              placeholder="Icarus auto-roots"
              value={draft.simulationTop}
              onChange={(event) =>
                setDraft((value) => ({ ...value, simulationTop: event.target.value }))
              }
            />
            <small>Usually the testbench module.</small>
          </label>
        </div>
        <label>
          <span>Include paths</span>
          <textarea
            rows={5}
            placeholder={'rtl/include\n../shared'}
            value={includeText}
            onChange={(event) => setIncludeText(event.target.value)}
          />
          <small>One project-relative or absolute directory per line.</small>
        </label>
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
