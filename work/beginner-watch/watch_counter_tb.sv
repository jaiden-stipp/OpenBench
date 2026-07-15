`timescale 1ns/1ps
module watch_counter_tb;
    logic clk = 0;
    logic rst_n = 0;
    logic [2:0] count;
    watch_counter dut (.clk, .rst_n, .count);
    always #5 clk = ~clk;
    initial begin
        $dumpfile("watch_counter.vcd");
        $dumpvars(0, watch_counter_tb);
        #12 rst_n = 1;
        #40 $finish;
    end
endmodule
