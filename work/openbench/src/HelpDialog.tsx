export default function HelpDialog({ simulator, onClose, onComposeEmail }: { simulator: ProjectSettings['simulator']; onClose: () => void; onComposeEmail: (kind: 'feedback' | 'bug') => void }) {
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="settings-heading"><div><small>BEGINNER GUIDE</small><h2 id="help-title">What OpenBench supports</h2></div><button aria-label="Close help" onClick={onClose}>×</button></div>
      <p>OpenBench deliberately targets the practical overlap between Icarus and Verilator: synthesizable RTL plus small procedural testbenches. You do not need classes or UVM to see a first waveform.</p>
      <div className="support-grid">
        <section><h3>Good fit</h3><ul><li>Modules, parameters, wires, and <code>logic</code></li><li><code>always</code>, <code>always_comb</code>, and <code>always_ff</code></li><li>Assignments, if/case, loops, enums, and packed vectors</li><li>Simple testbench <code>initial</code>/<code>always</code> blocks, delays, clocks, reset, <code>$display</code>, and VCD dumping</li></ul></section>
        <section><h3>Not the promised subset</h3><ul><li>UVM, classes, factories, mailboxes, and constrained randomization</li><li>DPI/VPI integrations and vendor-specific primitives</li><li>Advanced assertions, coverage, interfaces, or package behavior where backend support differs</li><li>Timing-accurate gate-level or analog simulation</li></ul></section>
      </div>
      <div className="support-backend"><strong>Selected backend: {simulator === 'iverilog' ? 'Icarus Verilog' : 'Verilator'}</strong><span>{simulator === 'iverilog' ? 'Best-supported first-run path in this build, including VCD and compiled signal-stop conditions.' : 'Lint is validated. Full simulation additionally needs Make and a supported C++ compiler.'}</span></div>
      <p className="help-note">When a tool reports a known unsupported construct, OpenBench adds a plain-language, clickable explanation beside the untouched raw message.</p>
      <section className="feedback-card"><div><small>FEEDBACK + BUG REPORTS</small><h3>Help shape OpenBench</h3><p>Send feedback directly to <strong>jaidenstipp@gmail.com</strong>. The buttons open your default email app with useful project details already filled in.</p></div><div className="feedback-actions"><button onClick={() => onComposeEmail('feedback')}>Send Feedback</button><button className="primary" onClick={() => onComposeEmail('bug')}>Report a Bug</button></div></section>
      <div className="settings-actions"><button className="primary" onClick={onClose}>Got it</button></div>
    </section>
  </div>;
}
