`timescale 1ns/1ps

module rtldeck_smoke_tb;
    logic clk = 0;
    logic rst_n = 0;
    logic [3:0] value = 0;
    logic [3:0] total;

    rtldeck_smoke dut (.clk, .rst_n, .value, .total);

    always #5 clk = ~clk;

    initial begin
        $dumpfile("rtldeck_smoke.vcd");
        $dumpvars(0, rtldeck_smoke_tb);
        #12 rst_n = 1;
        value = 4'd3;
        #10 value = 4'd2;
        #20;
        if (total !== 4'd7) $fatal(1, "Unexpected total: %d", total);
        $finish;
    end
endmodule
