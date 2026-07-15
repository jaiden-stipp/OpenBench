# OpenBench Phase 0 toolchain requirements

OpenBench invokes real EDA tools; it does not fabricate simulation or netlist data.

Install and place on `PATH`:

- **Yosys** (required): elaborates Verilog/SystemVerilog supported by the installed Yosys build and writes JSON netlists.
- **Icarus Verilog** *or* **Verilator** (at least one required): compiles/runs testbenches and produces VCD traces. OpenBench exposes this selection in Project Settings.

On Windows, the most reliable practical option is a supported Linux environment (for example WSL) with the distribution packages. Native Windows package availability and SystemVerilog support vary by release, so tool discovery must use explicit configured executable paths rather than assuming `PATH` alone.

If tools run in WSL, the desktop app must be configured with a WSL launcher (for example `wsl.exe`) and a Linux project path; a Windows `PATH` lookup cannot discover Linux executables. This configuration is a Phase 4 requirement and is not being silently assumed by the smoke harness.

Suggested Linux package install:

```bash
sudo apt update
sudo apt install yosys iverilog verilator
```

For a portable native Windows toolchain, YosysHQ publishes OSS CAD Suite releases containing Yosys, Icarus Verilog, and Verilator. The Windows archive is a self-extracting executable and is not Authenticode-signed; verify its SHA-256 against the digest returned by the official GitHub release API before executing it.

The Phase 0 harness avoids executing the self-extractor: Windows `tar` can read and extract its archive payload directly. On this runtime, the extracted tools must be mounted temporarily at a drive root because Yosys and Icarus fail to locate bundled data from the long workspace path. `run-oss-cad-smoke.ps1` handles the temporary `R:` mapping and removes it afterward.

Validate a native Windows installation from this directory:

```powershell
pwsh ./run-smoke.ps1 -Simulator iverilog
# or
pwsh ./run-smoke.ps1 -Simulator verilator
```

For WSL, run the equivalent smoke commands from the project directory mounted under `/mnt/c/...`; Phase 0 must still produce the same two real artifacts.

Expected real artifacts, created only by successful tool runs:

- `results/rtlbench_smoke.json` — Yosys `write_json` netlist.
- `results/rtlbench_smoke.vcd` — simulator waveform trace.
