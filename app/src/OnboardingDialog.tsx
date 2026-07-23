import { useEffect, useState } from 'react';
import ThemeLogo from './components/ThemeLogo';

const TASKS = [
  {
    eyebrow: 'STEP 1 OF 5',
    title: 'Compile the example',
    text: 'Click Run Compile. A short result appears in the console below.',
    hint: 'This catches syntax and language-support problems before simulation.',
    target: '[data-testid="run-compile"]',
  },
  {
    eyebrow: 'STEP 2 OF 5',
    title: 'Run the simulation',
    text: 'Click Run Simulation. RTLDeck runs the testbench and opens its waveform.',
    hint: 'The waveform uses the bundled simulator selected in project settings.',
    target: '[data-testid="run-simulation"]',
  },
  {
    eyebrow: 'STEP 3 OF 5',
    title: 'Place the time cursor',
    text: 'Click anywhere on the waveform trace. The yellow cursor lets you read every signal value at the same moment.',
    hint: 'Use the wheel to zoom. Shift + wheel pans across time.',
    target: '.wave-canvas-scroll canvas',
  },
  {
    eyebrow: 'STEP 4 OF 5',
    title: 'Build the RTL schematic',
    text: 'Click RTL Analysis to view registers, muxes, gates, modules, and their connections.',
    hint: 'This is the design hardware structure, not the testbench waveform.',
    target: '[data-testid="run-rtl"]',
  },
  {
    eyebrow: 'STEP 5 OF 5',
    title: 'Jump back to the source',
    text: 'Select a block, then click Open source in the schematic toolbar.',
    hint: 'Waveform signals and schematic connections can also take you back to source.',
    target: '.schematic-node',
  },
];

type OnboardingProps = {
  onSkip: () => void;
  onOpenExample: () => Promise<void>;
  onFinish: () => void;
  compilePassed: boolean;
  waveformReady: boolean;
  waveformInteracted: boolean;
  schematicReady: boolean;
  activeView: 'source' | 'waveform' | 'schematic';
};

export default function OnboardingDialog({
  onSkip,
  onOpenExample,
  onFinish,
  compilePassed,
  waveformReady,
  waveformInteracted,
  schematicReady,
  activeView,
}: OnboardingProps) {
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

  const startTutorial = async () => {
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
  };
  if (step === 0)
    return <TutorialIntroduction {...{ onSkip, opening, startError, startTutorial }} />;
  if (step > TASKS.length) return <TutorialComplete onFinish={onFinish} />;
  return <TutorialTask step={step} onSkip={onSkip} />;
}

function TutorialIntroduction({
  onSkip,
  opening,
  startError,
  startTutorial,
}: {
  onSkip: () => void;
  opening: boolean;
  startError: string;
  startTutorial: () => Promise<void>;
}) {
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="onboarding-visual">
          <ThemeLogo />
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
            <small>QUICK START</small>
            <button onClick={onSkip}>Skip tutorial</button>
          </div>
          <h1 id="onboarding-title">Learn RTLDeck by using it</h1>
          <p>
            Practice the complete workflow in an example project. RTLDeck waits for each action
            before continuing.
          </p>
          <ul>
            <li>No toolchain setup required</li>
            <li>Your own projects are not changed</li>
            <li>Takes about two minutes</li>
          </ul>
          {startError && <p className="tutorial-start-error">{startError}</p>}
          <TutorialProgress />
          <div className="dialog-actions">
            <button className="primary" disabled={opening} onClick={() => void startTutorial()}>
              {opening ? 'Opening example…' : 'Start hands-on tutorial'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TutorialComplete({ onFinish }: { onFinish: () => void }) {
  return (
    <aside className="tutorial-coach tutorial-complete" role="status">
      <div className="onboarding-top">
        <small>TUTORIAL COMPLETE</small>
      </div>
      <h2>You completed the workflow</h2>
      <p>You compiled HDL, inspected a waveform, elaborated RTL, and returned to the source.</p>
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
}

function TutorialTask({ step, onSkip }: { step: number; onSkip: () => void }) {
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
      <TutorialProgress step={step} />
      <small className="tutorial-waiting">
        <i /> Waiting for you to complete this task
      </small>
    </aside>
  );
}

function TutorialProgress({ step = 0 }: { step?: number }) {
  return (
    <div
      className="onboarding-progress"
      aria-label={step ? `Task ${step} of ${TASKS.length}` : 'Tutorial introduction'}
    >
      {TASKS.map((_, index) => (
        <i key={index} className={step && index < step ? 'active' : ''} />
      ))}
    </div>
  );
}
