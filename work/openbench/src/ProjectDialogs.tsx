import { useMemo, useState } from 'react';

export function ImportProjectDialog({ selection, onCancel, onConfirm }: { selection: ProjectSelection; onCancel: () => void; onConfirm: (name: string, files: string[]) => void }) {
  const [name, setName] = useState(selection.name);
  const [files, setFiles] = useState(() => new Set(selection.selected));
  const selectedCount = files.size;
  const sorted = useMemo(() => [...selection.candidates].sort((a, b) => a.localeCompare(b)), [selection.candidates]);
  const toggle = (file: string) => setFiles((current) => { const next = new Set(current); if (next.has(file)) next.delete(file); else next.add(file); return next; });
  return <div className="modal-backdrop"><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
    <div className="settings-heading"><div><small>ADD PROJECT</small><h2 id="import-title">Choose project files</h2></div><button aria-label="Close" onClick={onCancel}>×</button></div>
    <p>OpenBench will compile and elaborate only the checked HDL files. You can add or remove files later from the Project panel.</p>
    <label className="project-name"><span>Project name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="selection-actions"><span>{selectedCount} of {sorted.length} selected</span><button onClick={() => setFiles(new Set(sorted))}>Select all</button><button onClick={() => setFiles(new Set())}>Select none</button></div>
    <div className="project-file-picker">{sorted.length ? sorted.map((file) => <label key={file}><input type="checkbox" checked={files.has(file)} onChange={() => toggle(file)} /><span>{file}</span></label>) : <div className="empty-selection">No Verilog or SystemVerilog files were found. Add files after opening the project.</div>}</div>
    <div className="dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onConfirm(name.trim() || selection.name, [...files])}>Add Project</button></div>
  </section></div>;
}

export function NewProjectDialog({ parent, onCancel, onCreate }: { parent: string; onCancel: () => void; onCreate: (name: string, withStarter: boolean) => void }) {
  const [name, setName] = useState('my-first-design');
  const [withStarter, setWithStarter] = useState(true);
  return <div className="modal-backdrop"><section className="project-dialog compact" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
    <div className="settings-heading"><div><small>NEW PROJECT</small><h2 id="new-project-title">Start with a working simulation</h2></div><button aria-label="Close" onClick={onCancel}>×</button></div>
    <p>OpenBench creates the folder, project manifest, and—by default—a small design and testbench that runs immediately with the bundled Icarus backend.</p>
    <label className="project-name"><span>Project name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="location-preview"><span>Location</span><code>{parent}</code></div>
    <label className="starter-choice"><input type="checkbox" checked={withStarter} onChange={(event) => setWithStarter(event.target.checked)} /><span><strong>Create runnable starter</strong><small>Includes a synthesizable module, procedural testbench, VCD setup, and Icarus project settings.</small></span></label>
    <div className="dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), withStarter)}>Create Project</button></div>
  </section></div>;
}

export function TextPromptDialog({ title, label, initialValue = '', confirmLabel, onCancel, onConfirm }: { title: string; label: string; initialValue?: string; confirmLabel: string; onCancel: () => void; onConfirm: (value: string) => void }) {
  const [value, setValue] = useState(initialValue);
  return <div className="modal-backdrop"><section className="project-dialog prompt" role="dialog" aria-modal="true">
    <div className="settings-heading"><div><small>PROJECT</small><h2>{title}</h2></div><button aria-label="Close" onClick={onCancel}>×</button></div>
    <label className="project-name"><span>{label}</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) onConfirm(value.trim()); }} /></label>
    <div className="dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary" disabled={!value.trim()} onClick={() => onConfirm(value.trim())}>{confirmLabel}</button></div>
  </section></div>;
}
