`timescale 1ns/1ps

// Beginner-sized FSM used to validate OpenBench's first-run workflow.
module traffic_light(
    input  logic clk,
    input  logic rst_n,
    input  logic request,
    output logic red,
    output logic yellow,
    output logic green
);
    typedef enum logic [1:0] { STOP, GO, WARN } state_t;
    state_t state, next_state;

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= STOP;
        else state <= next_state;
    end

    always_comb begin
        next_state = state;
        red = 1'b0;
        yellow = 1'b0;
        green = 1'b0;
        case (state)
            STOP: begin red = 1'b1; if (request) next_state = GO; end
            GO: begin green = 1'b1; if (!request) next_state = WARN; end
            WARN: begin yellow = 1'b1; next_state = STOP; end
            default: next_state = STOP;
        endcase
    end
endmodule
