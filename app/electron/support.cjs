const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runIcarusSimulation } = require('./simulator.cjs');
const { runYosysElaboration } = require('./yosys.cjs');

async function runBackendSelfTest(suiteRoot) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbench-health-'));
  const started = Date.now();
  try {
    const design = `module health_counter(input logic clk, input logic rst_n, output logic q); always_ff @(posedge clk or negedge rst_n) if (!rst_n) q <= 1'b0; else q <= ~q; endmodule\n`;
    const testbench = `\`timescale 1ns/1ps\nmodule health_counter_tb; logic clk=0, rst_n=0, q; health_counter dut(.*); always #5 clk=~clk; initial begin $dumpfile("health.vcd"); $dumpvars(0, health_counter_tb); #12 rst_n=1; #30 $finish; end endmodule\n`;
    await fsp.writeFile(path.join(root, 'health_counter.sv'), design, 'utf8');
    await fsp.writeFile(path.join(root, 'health_counter_tb.sv'), testbench, 'utf8');
    const simulation = await runIcarusSimulation({
      projectRoot: root,
      files: ['health_counter.sv', 'health_counter_tb.sv'],
      suiteRoot,
      topModule: 'health_counter_tb',
    });
    const synthesis = await runYosysElaboration({
      projectRoot: root,
      files: ['health_counter.sv'],
      suiteRoot,
      topModule: 'health_counter',
    });
    const vcd = await fsp.stat(simulation.vcdPath);
    return {
      ok: true,
      durationMs: Date.now() - started,
      tools: {
        iverilog: 'passed real compile and simulation',
        yosys: `passed real JSON elaboration (${synthesis.moduleCount} module)`,
        waveform: `${vcd.size} byte genuine VCD`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      tools: {},
    };
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function createSupportBundle({
  appVersion,
  project,
  settings,
  consoleText,
  includeSource = false,
}) {
  const bundle = {
    format: 'openbench-support-v1',
    createdAt: new Date().toISOString(),
    openBench: {
      version: appVersion,
      platform: process.platform,
      architecture: process.arch,
      node: process.versions.node,
      electron: process.versions.electron,
    },
    project: project
      ? { name: project.name, files: project.files, folders: project.folders }
      : null,
    settings,
    consoleOutput: String(consoleText || '').slice(-100000),
    privacy: {
      sourceIncluded: Boolean(includeSource),
      note: includeSource
        ? 'The user explicitly chose to include project source.'
        : 'Project source is excluded by default.',
    },
  };
  if (includeSource && project?.root) {
    bundle.source = {};
    for (const relative of project.files || [])
      bundle.source[relative] = await fsp.readFile(path.join(project.root, relative), 'utf8');
  }
  return bundle;
}

module.exports = { createSupportBundle, runBackendSelfTest };
