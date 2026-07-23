import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

export function ImportProjectDialog({
  selection,
  onCancel,
  onConfirm,
}: {
  selection: ProjectSelection;
  onCancel: () => void;
  onConfirm: (name: string, files: string[], topModule: string, simulationTop: string) => void;
}) {
  const [name, setName] = useState(selection.name);
  const [files, setFiles] = useState(() => new Set(selection.selected));
  const selectedCount = files.size;
  const sorted = useMemo(
    () => [...selection.candidates].sort((a, b) => a.localeCompare(b)),
    [selection.candidates],
  );
  const designModules = useMemo(
    () =>
      (selection.modules || []).filter(
        (module) => files.has(module.file) && selection.roles?.[module.file] !== 'testbench',
      ),
    [files, selection.modules, selection.roles],
  );
  const simulationModules = useMemo(
    () =>
      (selection.modules || []).filter(
        (module) => files.has(module.file) && selection.roles?.[module.file] === 'testbench',
      ),
    [files, selection.modules, selection.roles],
  );
  const [topModule, setTopModule] = useState(selection.suggestedTop || '');
  const [simulationTop, setSimulationTop] = useState(selection.suggestedSimulationTop || '');
  const toggle = (file: string) =>
    setFiles((current) => {
      const next = new Set(current);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  return (
    <div className="modal-backdrop">
      <section
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <ImportDialogHeader existing={selection.existingProject} onCancel={onCancel} />
        <p>
          {selection.existingProject
            ? 'RTLDeck found project settings in this folder. Confirm the active modules before opening it.'
            : 'Choose the HDL files to include, then confirm the design module used for RTL analysis.'}
        </p>
        <ImportTopSelectors
          designModules={designModules}
          simulationModules={simulationModules}
          topModule={topModule}
          simulationTop={simulationTop}
          setTopModule={setTopModule}
          setSimulationTop={setSimulationTop}
        />
        <label className="project-name">
          <span>Project name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {!selection.existingProject && (
          <div className="selection-actions">
            <span>
              {selectedCount} of {sorted.length} selected
            </span>
            <button onClick={() => setFiles(new Set(sorted))}>Select all</button>
            <button onClick={() => setFiles(new Set())}>Select none</button>
          </div>
        )}
        {!selection.existingProject && (
          <ImportFilePicker
            files={files}
            sorted={sorted}
            roles={selection.roles}
            onToggle={toggle}
          />
        )}
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!selection.existingProject && (!files.size || !topModule)}
            onClick={() =>
              onConfirm(name.trim() || selection.name, [...files], topModule, simulationTop)
            }
          >
            {selection.existingProject ? 'Open Project' : 'Add Project'}
          </button>
        </div>
      </section>
    </div>
  );
}

type ModuleChoice = { name: string; file: string };

function ImportDialogHeader({ existing, onCancel }: { existing?: boolean; onCancel: () => void }) {
  return (
    <div className="settings-heading">
      <div>
        <small>{existing ? 'OPEN PROJECT' : 'ADD PROJECT'}</small>
        <h2 id="import-title">{existing ? 'Open existing project' : 'Choose project files'}</h2>
      </div>
      <button aria-label="Close" onClick={onCancel}>
        ×
      </button>
    </div>
  );
}

function ImportTopSelectors({
  designModules,
  simulationModules,
  topModule,
  simulationTop,
  setTopModule,
  setSimulationTop,
}: {
  designModules: ModuleChoice[];
  simulationModules: ModuleChoice[];
  topModule: string;
  simulationTop: string;
  setTopModule: (value: string) => void;
  setSimulationTop: (value: string) => void;
}) {
  return (
    <div className="settings-columns import-top-selection">
      <ModuleSelector
        label="Design top module"
        value={topModule}
        modules={designModules}
        empty="Select a design module"
        help="Used by RTL Analysis; a testbench is not required."
        onChange={setTopModule}
      />
      <ModuleSelector
        label="Simulation top module"
        value={simulationTop}
        modules={simulationModules}
        empty="No testbench selected"
        help="Optional. Select a testbench when you want to simulate."
        onChange={setSimulationTop}
      />
    </div>
  );
}

function ModuleSelector({
  label,
  value,
  modules,
  empty,
  help,
  onChange,
}: {
  label: string;
  value: string;
  modules: ModuleChoice[];
  empty: string;
  help: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        value={modules.some((module) => module.name === value) ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{empty}</option>
        {modules.map((module) => (
          <option key={`${module.file}:${module.name}`} value={module.name}>
            {module.name} — {module.file}
          </option>
        ))}
      </select>
      <small>{help}</small>
    </label>
  );
}

function ImportFilePicker({
  files,
  sorted,
  roles,
  onToggle,
}: {
  files: Set<string>;
  sorted: string[];
  roles?: Record<string, string>;
  onToggle: (file: string) => void;
}) {
  return (
    <div className="project-file-picker">
      {sorted.length ? (
        sorted.map((file) => (
          <label key={file}>
            <input type="checkbox" checked={files.has(file)} onChange={() => onToggle(file)} />
            <span>{file}</span>
            <small className={`file-role ${roles?.[file] || 'design'}`}>
              {roles?.[file] || 'design'}
            </small>
          </label>
        ))
      ) : (
        <div className="empty-selection">
          No Verilog or SystemVerilog files were found. Add files after opening the project.
        </div>
      )}
    </div>
  );
}

export function NewProjectDialog({
  parent,
  onCancel,
  onCreate,
}: {
  parent: string;
  onCancel: () => void;
  onCreate: (name: string, withStarter: boolean, topModule: string) => void;
}) {
  const [name, setName] = useState('my-first-design');
  const [withStarter, setWithStarter] = useState(true);
  const [topModule, setTopModule] = useState('my_first_design');
  const [topEdited, setTopEdited] = useState(false);
  return (
    <div className="modal-backdrop">
      <section
        className="project-dialog compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
      >
        <div className="settings-heading">
          <div>
            <small>NEW PROJECT</small>
            <h2 id="new-project-title">Start with a working simulation</h2>
          </div>
          <button aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <p>
          Create an empty project or start with a small design and testbench that run immediately.
        </p>
        <label className="project-name">
          <span>Project name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!topEdited) setTopModule(moduleNameFromProject(next));
            }}
          />
        </label>
        {withStarter && (
          <label className="project-name">
            <span>Design top module</span>
            <input
              value={topModule}
              onChange={(event) => {
                setTopEdited(true);
                setTopModule(event.target.value.replace(/[^A-Za-z0-9_$]/g, '_'));
              }}
            />
            <small>RTL Analysis uses this module without needing the testbench.</small>
          </label>
        )}
        <div className="location-preview">
          <span>Location</span>
          <code>{parent}</code>
        </div>
        <label className="starter-choice">
          <input
            type="checkbox"
            checked={withStarter}
            onChange={(event) => setWithStarter(event.target.checked)}
          />
          <span>
            <strong>Create runnable starter</strong>
            <small>
              Includes a synthesizable module, testbench, waveform setup, and project settings.
            </small>
          </span>
        </label>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim() || (withStarter && !topModule.trim())}
            onClick={() => onCreate(name.trim(), withStarter, topModule.trim())}
          >
            Create Project
          </button>
        </div>
      </section>
    </div>
  );
}

function moduleNameFromProject(name: string) {
  return name.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]/, '_$&') || 'design';
}

export function TextPromptDialog({
  title,
  label,
  initialValue = '',
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="modal-backdrop">
      <section className="project-dialog prompt" role="dialog" aria-modal="true">
        <div className="settings-heading">
          <div>
            <small>PROJECT</small>
            <h2>{title}</h2>
          </div>
          <button aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <label className="project-name">
          <span>{label}</span>
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.trim()) onConfirm(value.trim());
            }}
          />
        </label>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function StimulusDialog({
  moduleName,
  inputs,
  onCancel,
  onGenerate,
}: {
  moduleName: string;
  inputs: string[];
  onCancel: () => void;
  onGenerate: (options: {
    clockPeriod: number;
    resetDuration: number;
    finishTime: number;
    steps: Array<{ time: number; signal: string; value: string }>;
  }) => void;
}) {
  const [clockPeriod, setClockPeriod] = useState(10);
  const [resetDuration, setResetDuration] = useState(12);
  const [finishTime, setFinishTime] = useState(100);
  const [steps, setSteps] = useState<Array<{ time: number; signal: string; value: string }>>(() =>
    inputs[0]
      ? [
          { time: 20, signal: inputs[0], value: "1'b1" },
          { time: 40, signal: inputs[0], value: "1'b0" },
        ]
      : [],
  );
  return (
    <div className="modal-backdrop">
      <section
        className="project-dialog stimulus-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stimulus-title"
      >
        <div className="settings-heading">
          <div>
            <small>VISUAL TESTBENCH SCAFFOLD</small>
            <h2 id="stimulus-title">Stimulate {moduleName}</h2>
          </div>
          <button aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <p>
          Describe a simple timeline. RTLDeck converts it into ordinary editable SystemVerilog—there
          is no proprietary stimulus format.
        </p>
        <StimulusTiming
          settings={{ clockPeriod, resetDuration, finishTime }}
          setters={{ setClockPeriod, setResetDuration, setFinishTime }}
        />
        <div className="stimulus-heading">
          <strong>Input changes</strong>
          <button
            disabled={!inputs.length}
            onClick={() =>
              setSteps((current) => [
                ...current,
                {
                  time: Math.min(
                    finishTime,
                    Math.max(resetDuration, (current.at(-1)?.time || resetDuration) + 10),
                  ),
                  signal: inputs[0],
                  value: "1'b1",
                },
              ])
            }
          >
            + Add change
          </button>
        </div>
        <StimulusSteps
          inputs={inputs}
          steps={steps}
          setSteps={setSteps}
          resetDuration={resetDuration}
          finishTime={finishTime}
        />
        {!inputs.length && (
          <div className="empty-selection">
            No non-clock/reset input ports were detected. The generated testbench will still include
            clock, reset, VCD dumping, and a bounded finish.
          </div>
        )}
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            onClick={() => onGenerate({ clockPeriod, resetDuration, finishTime, steps })}
          >
            Generate editable testbench
          </button>
        </div>
      </section>
    </div>
  );
}

type StimulusStep = { time: number; signal: string; value: string };

function StimulusTiming({
  settings,
  setters,
}: {
  settings: { clockPeriod: number; resetDuration: number; finishTime: number };
  setters: {
    setClockPeriod: (value: number) => void;
    setResetDuration: (value: number) => void;
    setFinishTime: (value: number) => void;
  };
}) {
  const fields = [
    { label: 'Clock period', value: settings.clockPeriod, min: 2, set: setters.setClockPeriod },
    {
      label: 'Release reset at',
      value: settings.resetDuration,
      min: 0,
      set: setters.setResetDuration,
    },
    { label: 'Finish at', value: settings.finishTime, min: 1, set: setters.setFinishTime },
  ];
  return (
    <div className="stimulus-settings">
      {fields.map((field) => (
        <label key={field.label}>
          {field.label}
          <input
            type="number"
            min={field.min}
            value={field.value}
            onChange={(event) => field.set(Number(event.target.value))}
          />
        </label>
      ))}
    </div>
  );
}

function StimulusSteps({
  inputs,
  steps,
  setSteps,
  resetDuration,
  finishTime,
}: {
  inputs: string[];
  steps: StimulusStep[];
  setSteps: Dispatch<SetStateAction<StimulusStep[]>>;
  resetDuration: number;
  finishTime: number;
}) {
  const update = (index: number, change: Partial<StimulusStep>) =>
    setSteps((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...change } : item)),
    );
  return (
    <div className="stimulus-steps">
      {steps.map((step, index) => (
        <div key={index}>
          <input
            aria-label="Time"
            type="number"
            min={resetDuration}
            max={finishTime}
            value={step.time}
            onChange={(event) => update(index, { time: Number(event.target.value) })}
          />
          <select
            aria-label="Input signal"
            value={step.signal}
            onChange={(event) => update(index, { signal: event.target.value })}
          >
            {inputs.map((input) => (
              <option key={input}>{input}</option>
            ))}
          </select>
          <input
            aria-label="Value"
            value={step.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button
            aria-label="Remove change"
            onClick={() =>
              setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
