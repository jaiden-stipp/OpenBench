module unsupported(input logic clk);
  covergroup first_cover @(posedge clk);
    coverpoint clk;
  endgroup
endmodule
