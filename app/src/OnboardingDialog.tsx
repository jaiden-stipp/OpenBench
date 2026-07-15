import { useEffect, useState } from 'react';
import openBenchLogo from './assets/openbench-logo.png';

const TASKS = [
  {
    eyebrow: '1 OF 5 · CHECK',
    title: 'Compile the example',
    text: 'Click the highlighted Run Compile button. OpenBench will check the real source with the selected backend. A successful result appears in the console below.',
    hint: 'This catches syntax and language-support problems before simulation.',
    target: '[data-testid="run-compile"]',
  },
  {
    eyebrow: '2 OF 5 · RUN',
    title: 'Create a real waveform',
    text: 'Click Run Simulation. OpenBench compiles and runs the testbench, then opens the VCD waveform automatically.',
    hint: 'The displayed trace comes from Icarus or Verilator—not sample data.',
    target: '[data-testid="run-simulation"]',
  },
  {
    eyebrow: '3 OF 5 · INSPECT',
    title: 'Place the time cursor',
    text: 'Click anywhere on the waveform trace. The yellow cursor lets you read every signal value at the same moment.',
    hint: 'Use the wheel to zoom. Shift + wheel pans across time.',
    target: '.wave-canvas-scroll canvas',
  },
  {
    eyebrow: '4 OF 5 · UNDERSTAND',
    title: 'Build the RTL schematic',
    text: 'Click RTL Analysis. Yosys elaborates the source into registers, muxes, gates, and connections you can explore.',
    hint: 'This is the design hardware structure, not the testbench waveform.',
    target: '[data-testid="run-rtl"]',
  },
  {
    eyebrow: '5 OF 5 · CROSS-PROBE',
    title: 'Jump back to the source',
    text: 'Click any block in the schematic. OpenBench will open the Verilog line that produced it.',
    hint: 'Waveform signals and schematic connections can also take you back to source.',
    target: '.schematic-node',
  },
];

export default function OnboardingDialog({
  onSkip,
  onOpenExample,
  onFinish,
  compilePassed,
  waveformReady,
  waveformInteracted,
  schematicReady,
  activeView,
}: {
  onSkip: () => void;
  onOpenExample: () => Promise<void>;
  onFinish: () => void;
  compilePassed: boolean;
  waveformReady: boolean;
  waveformInteracted: boolean;
  schematicReady: boolean;
  activeView: 'source' | 'waveform' | 'schematic';
}) {
  const [step, setStep] = useState(0);
  const [opening, setOpening] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    if (step === 1 && compilePassed) setStep(2);
    else if (step === 2 && waveformReady) setStep(3);
    else if (step === 3 && waveformInteracted) setStep(4);
    else if (step === 4 && schematicReady && activeView === 'schematic') setStep(5);
    else if (step === 5 && schematicReady && activeView === 'source') setStep(6);
  }, [activeView, compilePassed, schematicReady, step, waveformInteracted, waveformReady]);

  useEffect(() => {
    if (step < 1 || step > TASKS.length) return;
    const selector = TASKS[step - 1].target;
    let highlighted: Element | null = null;
    const highlight = () => {
      const next = document.querySelector(selector);
      if (next === highlighted) return;
      highlighted?.classList.remove('tutorial-target');
      highlighted = next;
      highlighted?.classList.add('tutorial-target');
    };
    highlight();
    const timer = window.setInterval(highlight, 200);
    return () => {
      window.clearInterval(timer);
      highlighted?.classList.remove('tutorial-target');
    };
  }, [step]);

  if (step === 0)
    return (
      <div className="modal-backdrop onboarding-backdrop">
        <section
          className="onboarding-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <div className="onboarding-visual">
            <img className="theme-logo" src={openBenchLogo} alt="" />
            <div className="onboarding-flow">
              <span>Compile</span>
              <b>→</b>
              <span>Simulate</span>
              <b>→</b>
              <span>Inspect</span>
              <b>→</b>
              <span>RTL</span>
            </div>
          </div>
          <div className="onboarding-content">
            <div className="onboarding-top">
              <small>INTERACTIVE QUICK START</small>
              <button onClick={onSkip}>Skip tutorial</button>
            </div>
            <h1 id="onboarding-title">Learn OpenBench by using it</h1>
            <p>
              This five-task guide opens a safe example and waits while you perform the real
              workflow. You will compile Verilog, run a simulation, inspect its waveform, generate
              an RTL schematic, and jump back to source.
            </p>
            <ul>
              <li>Uses genuine bundled backend tools</li>
              <li>Your own projects are not changed</li>
              <li>Takes about two minutes</li>
            </ul>
            {startError && <p className="tutorial-start-error">{startError}</p>}
            <div className="onboarding-progress" aria-label="Tutorial introduction">
              {TASKS.map((_, index) => (
                <i key={index} />
              ))}
            </div>
            <div className="dialog-actions">
              <button
                className="primary"
                disabled={opening}
                onClick={async () => {
                  setOpening(true);
                  setStartError('');
                  try {
                    await onOpenExample();
                    setStep(1);
                  } catch (error) {
                    setStartError(error instanceof Error ? error.message : String(error));
                  } finally {
                    setOpening(false);
                  }
                }}
              >
                {opening ? 'Opening example…' : 'Start hands-on tutorial'}
              </button>
            </div>
          </div>
        </section>
      </div>
    );

  if (step > TASKS.length)
    return (
      <aside className="tutorial-coach tutorial-complete" role="status">
        <div className="onboarding-top">
          <small>TUTORIAL COMPLETE</small>
        </div>
        <h2>You completed the real workflow</h2>
        <p>
          You compiled HDL, produced and inspected a genuine waveform, elaborated RTL, and
          cross-probed back to Verilog.
        </p>
        <div className="tutorial-summary">
          <span>✓ Compile</span>
          <span>✓ Simulate</span>
          <span>✓ Waveform</span>
          <span>✓ RTL</span>
          <span>✓ Source</span>
        </div>
        <button className="primary" onClick={onFinish}>
          Finish
        </button>
      </aside>
    );

  const task = TASKS[step - 1];
  return (
    <aside className="tutorial-coach" role="status" aria-live="polite">
      <div className="onboarding-top">
        <small>{task.eyebrow}</small>
        <button onClick={onSkip}>Skip tutorial</button>
      </div>
      <h2>{task.title}</h2>
      <p>{task.text}</p>
      <div className="tutorial-hint">{task.hint}</div>
      <div className="onboarding-progress" aria-label={`Task ${step} of ${TASKS.length}`}>
        {TASKS.map((_, index) => (
          <i key={index} className={index < step ? 'active' : ''} />
        ))}
      </div>
      <small className="tutorial-waiting">
        <i /> Waiting for you to complete this task
      </small>
    </aside>
  );
}
