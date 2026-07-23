interface AboutDialogProps {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: AboutDialogProps) {
  return (
    <div className="modal-backdrop">
      <section className="project-dialog compact about-dialog" role="dialog" aria-modal="true">
        <div className="settings-heading">
          <div>
            <small>ABOUT</small>
            <h2>RTLDeck Preview</h2>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p>A Verilog/SystemVerilog workbench with bundled Icarus, Verilator, and Yosys tools.</p>
        <div className="about-points">
          <span>Simulation and VCD waveforms</span>
          <span>Interactive RTL schematics</span>
          <span>Clear, source-linked diagnostics</span>
        </div>
        <p className="license-notice">
          Copyright © 2026 Jaiden Stipp and RTLDeck contributors. RTLDeck is free software under the
          GNU GPL v3.0 and comes with absolutely no warranty. Bundled third-party tools retain their
          own licenses.
        </p>
        <div className="dialog-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
