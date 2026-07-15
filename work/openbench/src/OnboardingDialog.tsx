import { useState } from 'react';
import openBenchLogo from './assets/openbench-logo.png';

const STEPS = [
  { eyebrow: 'WELCOME', title: 'See your Verilog work, end to end', text: 'OpenBench keeps source, real simulator output, waveforms, and synthesized RTL in one place. This tour is optional and only appears automatically once.', points: ['No terminal or PATH setup', 'Real Icarus, Verilator, and Yosys runs', 'Everything stays editable'] },
  { eyebrow: 'WRITE + CHECK', title: 'Typos are caught while you type', text: 'Open files appear as tabs. OpenBench autosaves after a short pause, keeps a crash-recovery draft, and places genuine backend lint errors directly in the editor.', points: ['Red squiggles point to the exact line', 'Raw compile output is still available', 'Ctrl+S remains available for manual saves'] },
  { eyebrow: 'RUN + INSPECT', title: 'Run once, then explore visually', text: 'Run Simulation produces a real VCD. RTL Analysis asks Yosys for a JSON netlist and renders recognizable muxes, registers, gates, and module pins.', points: ['Click a waveform signal to find its source', 'Click an RTL block to return to HDL', 'Watch mode reruns after saves'] },
  { eyebrow: 'TRY IT', title: 'Start with a working counter', text: 'The example is a real editable project with a counter and testbench. Run it, change the enable timing, and watch the waveform change.', points: ['Press Run Simulation', 'Inspect count in Waveform', 'Press RTL Analysis to see the register and adder'] },
];

export default function OnboardingDialog({ onSkip, onOpenExample }: { onSkip: () => void; onOpenExample: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return <div className="modal-backdrop onboarding-backdrop"><section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className="onboarding-visual"><img className="theme-logo" src={openBenchLogo} alt="" /><div className="onboarding-flow"><span>Source</span><b>→</b><span>Simulate</span><b>→</b><span>Waveform</span><b>→</b><span>RTL</span></div></div>
    <div className="onboarding-content"><div className="onboarding-top"><small>{current.eyebrow}</small><button onClick={onSkip}>Skip tutorial</button></div><h1 id="onboarding-title">{current.title}</h1><p>{current.text}</p><ul>{current.points.map((point) => <li key={point}>{point}</li>)}</ul>
      <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((_, index) => <i key={index} className={index === step ? 'active' : ''} />)}</div>
      <div className="dialog-actions">{step > 0 && <button onClick={() => setStep((value) => value - 1)}>Back</button>}<button onClick={onSkip}>Skip</button>{step < STEPS.length - 1 ? <button className="primary" onClick={() => setStep((value) => value + 1)}>Next</button> : <button className="primary" onClick={onOpenExample}>Open Example Project</button>}</div>
    </div>
  </section></div>;
}
