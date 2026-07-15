`timescale 1ns/1ps

module rtlbench_smoke(
    input  logic       clk,
    input  logic       rst_n,
    input  logic [3:0] value,
    output logic [3:0] total
);
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            total <= '0;
        else
            total <= total + value;
    end
endmodule
