import { useMemo, useState } from 'react';

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
        <div className="settings-heading">
          <div>
            <small>{selection.existingProject ? 'OPEN PROJECT' : 'ADD PROJECT'}</small>
            <h2 id="import-title">
              {selection.existingProject ? 'Open existing project' : 'Choose project files'}
            </h2>
          </div>
          <button aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <p>
          {selection.existingProject
            ? 'OpenBench found project settings in this folder. Confirm the active modules before opening it.'
            : 'Choose the HDL files to include, then confirm the design module used for RTL analysis.'}
        </p>
        <div className="settings-columns import-top-selection">
          <label>
            <span>Design top module</span>
            <select
              value={designModules.some((module) => module.name === topModule) ? topModule : ''}
              onChange={(event) => setTopModule(event.target.value)}
            >
              <option value="">Select a design module</option>
              {designModules.map((module) => (
                <option key={`${module.file}:${module.name}`} value={module.name}>
                  {module.name} — {module.file}
                </option>
              ))}
            </select>
            <small>Used by RTL Analysis; a testbench is not required.</small>
          </label>
          <label>
            <span>Simulation top module</span>
            <select
              value={
                simulationModules.some((module) => module.name === simulationTop)
                  ? simulationTop
                  : ''
              }
              onChange={(event) => setSimulationTop(event.target.value)}
            >
              <option value="">No testbench selected</option>
              {simulationModules.map((module) => (
                <option key={`${module.file}:${module.name}`} value={module.name}>
                  {module.name} — {module.file}
                </option>
              ))}
            </select>
            <small>Optional. Select a testbench when you want to simulate.</small>
          </label>
        </div>
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
          <div className="project-file-picker">
            {sorted.length ? (
              sorted.map((file) => (
                <label key={file}>
                  <input type="checkbox" checked={files.has(file)} onChange={() => toggle(file)} />
                  <span>{file}</span>
                  <small className={`file-role ${selection.roles?.[file] || 'design'}`}>
                    {selection.roles?.[file] || 'design'}
                  </small>
                </label>
              ))
            ) : (
              <div className="empty-selection">
                No Verilog or SystemVerilog files were found. Add files after opening the project.
              </div>
            )}
          </div>
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
          Describe a simple timeline. OpenBench converts it into ordinary editable
          SystemVerilog—there is no proprietary stimulus format.
        </p>
        <div className="stimulus-settings">
          <label>
            Clock period
            <input
              type="number"
              min="2"
              value={clockPeriod}
              onChange={(event) => setClockPeriod(Number(event.target.value))}
            />
          </label>
          <label>
            Release reset at
            <input
              type="number"
              min="0"
              value={resetDuration}
              onChange={(event) => setResetDuration(Number(event.target.value))}
            />
          </label>
          <label>
            Finish at
            <input
              type="number"
              min="1"
              value={finishTime}
              onChange={(event) => setFinishTime(Number(event.target.value))}
            />
          </label>
        </div>
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
        <div className="stimulus-steps">
          {steps.map((step, index) => (
            <div key={index}>
              <input
                aria-label="Time"
                type="number"
                min={resetDuration}
                max={finishTime}
                value={step.time}
                onChange={(event) =>
                  setSteps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, time: Number(event.target.value) } : item,
                    ),
                  )
                }
              />
              <select
                aria-label="Input signal"
                value={step.signal}
                onChange={(event) =>
                  setSteps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, signal: event.target.value } : item,
                    ),
                  )
                }
              >
                {inputs.map((input) => (
                  <option key={input}>{input}</option>
                ))}
              </select>
              <input
                aria-label="Value"
                value={step.value}
                onChange={(event) =>
                  setSteps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
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
