import { analyzeHdlFiles, hasHdlToken } from '../shared/hdlStructure.js';

export function analyzeProjectSources(files, settings = {}) {
  const analysis = analyzeHdlFiles(files);
  const { modules, testbenches, topCandidates, missingModules, duplicates } = analysis;
  const simulationSources = files.filter((file) =>
    testbenches.some((testbench) => testbench.file === file.path),
  );
  const issues = [];
  if (!modules.length)
    issues.push({
      severity: 'error',
      title: 'No module declarations found',
      detail: 'Select at least one .v or .sv file containing a module.',
    });
  if (duplicates.length)
    issues.push({
      severity: 'error',
      title: 'Duplicate module names',
      detail: duplicates.map((item) => `${item.name} (${item.files.join(', ')})`).join('; '),
    });
  if (missingModules.length)
    issues.push({
      severity: 'warning',
      title: 'Referenced modules are missing',
      detail: missingModules.join(', '),
    });
  if (modules.length && !settings.topModule)
    issues.push({
      severity: 'warning',
      title: 'Design top is not selected',
      detail: topCandidates[0]
        ? `Likely design top: ${topCandidates[0].name}`
        : 'Choose the synthesizable module to analyze.',
    });
  if (testbenches.length && !settings.simulationTop)
    issues.push({
      severity: 'warning',
      title: 'Simulation top is not selected',
      detail: `Likely testbench: ${testbenches[0].name}`,
    });
  if (!testbenches.length)
    issues.push({
      severity: 'info',
      title: 'No obvious testbench found',
      detail: 'Generate a starter testbench after RTL Analysis or add a module named *_tb.',
    });
  if (
    testbenches.length &&
    !simulationSources.some(
      (file) => hasHdlToken(file.content, '$dumpvars') || hasHdlToken(file.content, '$fstDumpvars'),
    )
  )
    issues.push({
      severity: 'warning',
      title: 'Waveform dumping is not visible',
      detail: 'The testbench may run without producing a VCD/FST trace.',
    });
  if (testbenches.length && !simulationSources.some((file) => hasHdlToken(file.content, '$finish')))
    issues.push({
      severity: 'warning',
      title: 'Testbench may never finish',
      detail: 'Add a bounded $finish or another deliberate stop condition.',
    });
  return {
    modules,
    testbenches,
    topCandidates,
    missingModules,
    duplicates,
    issues,
    suggestedTop: settings.topModule || analysis.suggestedTop,
    suggestedSimulationTop: settings.simulationTop || analysis.suggestedSimulationTop,
  };
}

export function explainWaveform(data) {
  if (!data) return [];
  const explanations = [];
  if (!data.signals?.length)
    explanations.push({
      severity: 'error',
      title: 'The waveform contains no signals',
      detail: 'Check the testbench dump scope and selected simulation top.',
    });
  if (!data.timestampCount || data.endTime <= 0)
    explanations.push({
      severity: 'warning',
      title: 'Simulation time did not advance',
      detail: 'The testbench may finish immediately or have no delays/clock generator.',
    });
  const flat = (data.signals || []).filter((signal) => (signal.changes || []).length <= 1);
  const unknown = (data.signals || []).filter((signal) =>
    (signal.changes || []).some((change) => /[xz]/i.test(change[1])),
  );
  const clocks = (data.signals || []).filter(
    (signal) => /(?:^|[._])clk|clock/i.test(signal.name) && (signal.changes || []).length > 2,
  );
  if (flat.length && data.signals.length)
    explanations.push({
      severity: 'info',
      title: `${flat.length} signal${flat.length === 1 ? '' : 's'} never changed`,
      detail:
        'A flat signal can be correct. If unexpected, check reset, stimulus, enables, and simulation duration.',
    });
  if (unknown.length)
    explanations.push({
      severity: 'warning',
      title: `${unknown.length} signal${unknown.length === 1 ? '' : 's'} contain X or Z`,
      detail:
        'Common causes are missing reset initialization, incomplete assignments, disconnected ports, or multiple drivers.',
    });
  if (!clocks.length)
    explanations.push({
      severity: 'warning',
      title: 'No toggling clock was recognized',
      detail:
        'If this is sequential logic, confirm the clock generator is running and included in the dump scope.',
    });
  return explanations;
}
