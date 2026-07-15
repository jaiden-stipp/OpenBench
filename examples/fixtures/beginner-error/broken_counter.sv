module broken_counter(
    input logic clk,
    output logic [3:0] count
);
    always_ff @(posedge clk) begin
        count <= count + 1'b1
    end
endmodule
