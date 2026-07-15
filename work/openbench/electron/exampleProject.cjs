const fsp = require('node:fs/promises');
const path = require('node:path');
const { projectData, saveManifest } = require('./projectManager.cjs');
const { saveProjectSettings } = require('./settings.cjs');

const DESIGN = `module getting_started_counter (
  input  logic       clk,
  input  logic       rst_n,
  input  logic       enable,
  output logic [3:0] count
);
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) count <= 4'd0;
    else if (enable) count <= count + 4'd1;
  end
endmodule
`;

const TESTBENCH = `\`timescale 1ns/1ps
module getting_started_counter_tb;
  logic clk = 1'b0;
  logic rst_n = 1'b0;
  logic enable = 1'b0;
  logic [3:0] count;

  getting_started_counter dut (.*);
  always #5 clk = ~clk;

  initial begin
    $dumpfile("getting_started_counter.vcd");
    $dumpvars(0, getting_started_counter_tb);
    #12 rst_n = 1'b1;
    #8 enable = 1'b1;
    #50 enable = 1'b0;
    #20 $finish;
  end
endmodule
`;

async function ensureExampleProject(baseDirectory) {
  const root = path.join(baseDirectory, 'examples', 'getting-started');
  await fsp.mkdir(root, { recursive: true });
  const files = [['getting_started_counter.sv', DESIGN], ['getting_started_counter_tb.sv', TESTBENCH]];
  for (const [name, content] of files) {
    try { await fsp.writeFile(path.join(root, name), content, { encoding: 'utf8', flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  try { await fsp.access(path.join(root, '.openbench.json')); }
  catch { await saveManifest(root, { name: 'Getting Started Counter', files: files.map(([name]) => name), folders: [] }); }
  try { await fsp.access(path.join(root, '.rtlbench.json')); }
  catch { await saveProjectSettings(root, { topModule: 'getting_started_counter', simulationTop: 'getting_started_counter_tb', includePaths: [], simulator: 'iverilog', toolchainPath: '' }); }
  return projectData(root);
}

module.exports = { DESIGN, TESTBENCH, ensureExampleProject };
