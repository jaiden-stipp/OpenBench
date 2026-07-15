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

const LESSONS = {
  'getting-started': {
    name: 'Getting Started Counter',
    top: 'getting_started_counter',
    simulationTop: 'getting_started_counter_tb',
    files: [
      ['getting_started_counter.sv', DESIGN],
      ['getting_started_counter_tb.sv', TESTBENCH],
    ],
  },
  'traffic-light': {
    name: 'Traffic-light FSM',
    top: 'traffic_light',
    simulationTop: 'traffic_light_tb',
    files: [
      [
        'traffic_light.sv',
        `module traffic_light(input logic clk, input logic rst_n, output logic red, yellow, green);\n  typedef enum logic [1:0] {STOP, GO, WAIT} state_t; state_t state;\n  always_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) state <= STOP;\n    else case (state) STOP: state <= GO; GO: state <= WAIT; default: state <= STOP; endcase\n  end\n  always_comb begin red=0; yellow=0; green=0; case(state) STOP:red=1; GO:green=1; WAIT:yellow=1; endcase end\nendmodule\n`,
      ],
      [
        'traffic_light_tb.sv',
        `\`timescale 1ns/1ps\nmodule traffic_light_tb; logic clk=0, rst_n=0, red, yellow, green; traffic_light dut(.*); always #5 clk=~clk; initial begin $dumpfile("traffic_light.vcd"); $dumpvars(0,traffic_light_tb); #12 rst_n=1; #70 $finish; end endmodule\n`,
      ],
    ],
  },
  pwm: {
    name: 'PWM Generator',
    top: 'pwm_generator',
    simulationTop: 'pwm_generator_tb',
    files: [
      [
        'pwm_generator.sv',
        `module pwm_generator(input logic clk, input logic rst_n, input logic [3:0] duty, output logic pwm); logic [3:0] count; always_ff @(posedge clk or negedge rst_n) begin if(!rst_n) count<=0; else count<=count+1'b1; end assign pwm = count < duty; endmodule\n`,
      ],
      [
        'pwm_generator_tb.sv',
        `\`timescale 1ns/1ps\nmodule pwm_generator_tb; logic clk=0, rst_n=0; logic [3:0] duty=4; logic pwm; pwm_generator dut(.*); always #5 clk=~clk; initial begin $dumpfile("pwm.vcd"); $dumpvars(0,pwm_generator_tb); #12 rst_n=1; #160 duty=12; #160 $finish; end endmodule\n`,
      ],
    ],
  },
  alu: {
    name: 'Simple ALU',
    top: 'simple_alu',
    simulationTop: 'simple_alu_tb',
    files: [
      [
        'simple_alu.sv',
        `module simple_alu(input logic [3:0] a,b, input logic [1:0] op, output logic [3:0] y); always_comb case(op) 2'b00:y=a+b; 2'b01:y=a-b; 2'b10:y=a&b; default:y=a|b; endcase endmodule\n`,
      ],
      [
        'simple_alu_tb.sv',
        `\`timescale 1ns/1ps\nmodule simple_alu_tb; logic [3:0] a=5,b=3; logic [1:0] op=0; logic [3:0] y; simple_alu dut(.*); initial begin $dumpfile("alu.vcd"); $dumpvars(0,simple_alu_tb); #10 op=1; #10 op=2; #10 op=3; #10 a=9; b=6; op=0; #10 $finish; end endmodule\n`,
      ],
    ],
  },
};

async function ensureExampleProject(baseDirectory, lessonId = 'getting-started') {
  const lesson = LESSONS[lessonId] || LESSONS['getting-started'];
  const root = path.join(
    baseDirectory,
    'examples',
    lessonId in LESSONS ? lessonId : 'getting-started',
  );
  await fsp.mkdir(root, { recursive: true });
  const files = lesson.files;
  for (const [name, content] of files) {
    try {
      await fsp.writeFile(path.join(root, name), content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  try {
    await fsp.access(path.join(root, '.openbench.json'));
  } catch {
    await saveManifest(root, {
      name: lesson.name,
      files: files.map(([name]) => name),
      folders: [],
    });
  }
  try {
    await fsp.access(path.join(root, '.rtlbench.json'));
  } catch {
    await saveProjectSettings(root, {
      topModule: lesson.top,
      simulationTop: lesson.simulationTop,
      includePaths: [],
      simulator: 'iverilog',
      toolchainPath: '',
    });
  }
  return projectData(root);
}

module.exports = { DESIGN, LESSONS, TESTBENCH, ensureExampleProject };
