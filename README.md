<p align="center">
  <img src="app/src/assets/openbench-logo.png" width="180" alt="OpenBench logo">
</p>

<h1 align="center">OpenBench</h1>

<p align="center">
  Write Verilog. Run a real simulation. See the waveform and synthesized RTL.<br>
  Built for engineers with as little friction as possible.
</p>

<p align="center">
  <a href="../../releases/latest"><strong>Download the latest release</strong></a>
</p>

> OpenBench is a preview. Release workflows reject packages that fail platform trust checks or genuine bundled-backend tests.

## Download and install

Download the package for your operating system from the repository's [Releases page](../../releases/latest).

| Platform | Package | Status |
| --- | --- | --- |
| Windows 10/11 x64 | `OpenBench-*-Windows-x64.exe` | Validated with bundled Icarus, Verilator, and Yosys |
| Ubuntu/Debian x86_64 | `OpenBench-*-Linux-x86_64.deb` | Native install and genuine simulation are checked by the release workflow |
| Other Linux x86_64 | `OpenBench-*-Linux-x86_64.tar.gz` | Portable fallback without FUSE |
| macOS | DMG/ZIP planned | Packaging is configured but not yet validated on macOS hardware |

### Windows

1. Download the Windows installer.
2. Run the installer and choose an installation directory.
3. Launch **OpenBench** from the Start menu.

Windows may show a reputation warning because preview installers are currently unsigned.

### Linux

On Ubuntu, Debian, Linux Mint, Pop!_OS, and related distributions, download the `.deb` and open it with the system software installer. You can also install it from a terminal:

```bash
sudo apt install ./OpenBench-*-Linux-x86_64.deb
```

Other distributions can use the `.tar.gz` fallback by extracting it and launching `openbench`. Neither package requires FUSE.

The distributed packages include their native HDL toolchain. You do not need to install ModelSim, Icarus Verilog, Verilator, Yosys, or configure `PATH` separately.

## Get your first waveform

1. Launch OpenBench and follow or skip the optional first-run tutorial.
2. Choose **Help → Open Example Project** to explore a working counter, or choose **File → New Project** to create a runnable starter.
3. Press **Run Simulation**.
4. Inspect signals, place a cursor, zoom, search, and change radix in the Waveform view.
5. Press **RTL Analysis** to view the Yosys-elaborated design as a schematic.

Every waveform and schematic shown by OpenBench comes from a genuine simulator or Yosys run against the project source. Demo data is not mocked.

## Why OpenBench?

Learning Verilog should not begin with an afternoon of simulator installation, environment variables, and Tcl commands. OpenBench keeps the complete beginner workflow in one desktop application:

- Create or import an HDL project with files and folders.
- Edit Verilog and SystemVerilog with syntax highlighting, autosave, crash recovery, and inline lint diagnostics.
- Compile and simulate with bundled Icarus Verilog or use Verilator linting.
- Read plain-language explanations alongside the unmodified backend output.
- Explore VCD waveforms with zoom, cursors, value inspection, radix changes, search, grouping, reordering, and X/Z help.
- View recognizable muxes, registers, gates, memories, arithmetic blocks, modules, and labeled pins in a Yosys-derived RTL schematic.
- Cross-probe between source, waveform signals, and schematic blocks.
- Generate a simple editable starter testbench from module metadata.
- Recompile and refresh automatically with optional watch mode.
- Return to the same open tabs, editor position, and waveform layout after restarting the app.
- Diagnose common beginner problems through Project Health, including missing tops, duplicate or referenced modules, absent testbenches, non-toggling clocks, flat signals, and X/Z values.
- Measure waveforms with two cursors, frequency/delta readouts, named bookmarks, edge navigation, changed-signal filtering, and comparisons with recent persisted runs.
- Browse the elaborated module hierarchy and focus a module directly in the RTL schematic.
- Build simple timed input stimulus visually and keep the generated SystemVerilog fully editable.
- Run a genuine bundled-toolchain self-test and explore editable counter, FSM, PWM, and ALU lessons.
- Export a privacy-reviewed diagnostic bundle; HDL source is excluded by default.

## Projects and supported HDL

OpenBench projects store their selected HDL files and folders in `.openbench.json`. Project settings such as the top module, simulation top, include paths, simulator backend, and optional custom toolchain location are stored in `.rtlbench.json` for compatibility with projects created before the rename.

The current focus is synthesizable Verilog/SystemVerilog and straightforward procedural testbenches. Language support is limited to the constructs supported by the selected Icarus/Verilator backend; OpenBench calls out relevant backend limitations at compile time. Full UVM and VHDL are not currently supported.

## Local and offline by design

Source files, compilation, simulation, waveform parsing, synthesis, drafts, and session state stay on the local machine. After installation, normal project work does not require a hosted simulation service.

## Troubleshooting

- **Windows warns about the installer:** preview packages are unsigned. Verify that the file came from this repository's Releases page and compare its published SHA-256 checksum.
- **A language construct is rejected:** open Project Settings and check the selected backend. Icarus and Verilator support different SystemVerilog subsets; the raw backend message remains available in the console.
- **The wrong module runs:** set both **Top module** and **Simulation top** in Project Settings.
- **An include cannot be found:** add its project-relative directory under **Include paths**.
- **A development build cannot find a backend:** packaged releases bundle the toolchain, but source builds require a native OSS CAD Suite extraction. See the development section below.

## Feedback and bug reports

OpenBench is being shaped around the real problems students encounter while learning Verilog. Feedback about confusing workflows, missing explanations, accessibility, and ideas that would make the application easier to learn is welcome.

<p align="center">
  <a href="mailto:jaidenstipp@gmail.com?subject=OpenBench%20Feedback"><strong>Send OpenBench feedback</strong></a>
  &nbsp;·&nbsp;
  <a href="mailto:jaidenstipp@gmail.com?subject=OpenBench%20Bug%20Report"><strong>Report a bug</strong></a>
</p>

You can also email [jaidenstipp@gmail.com](mailto:jaidenstipp@gmail.com) directly.

For bug reports, please include:

- your operating system and OpenBench version;
- the selected simulator backend;
- what you expected to happen and what happened instead;
- the raw console output;
- steps to reproduce the problem;
- a small example project or screenshot when possible.

Do not attach private, proprietary, or course-restricted HDL unless you have permission to share it.

## Contributing

Bug reports, beginner-workflow feedback, documentation improvements, backend error patterns, and code contributions are welcome. Useful contribution areas include:

- clearer simulator error translations;
- additional beginner-level example designs;
- waveform accessibility and keyboard navigation;
- RTL symbol and pin-layout improvements;
- native packaging validation across Linux distributions and macOS.

Please keep the core product goal in mind: reduce the distance between having an HDL idea and seeing it work. Features that add commercial-EDA complexity without improving that workflow may be out of scope.

## Build from source

Requirements:

- Node.js 22 or newer
- pnpm 11 or newer
- A platform-native [YosysHQ OSS CAD Suite](https://github.com/YosysHQ/oss-cad-suite-build) extraction for genuine backend tests and packages

```bash
git clone <repository-url>
cd OpenBench/app
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm start
```

The current Windows suite contains 49 passing tests, including genuine Icarus compile/run/VCD, Verilator lint, Yosys JSON elaboration, session and recovery persistence, generated testbenches, compiled waveform conditions, project-path security, learning projects, and a 50,000-timestamp waveform benchmark.

See the [application development notes](app/README.md) and [architecture guide](docs/ARCHITECTURE.md) for implementation details. Maintainers can use the [packaging guide](PACKAGING.md) and [release handoff](docs/RELEASING.md) for native-toolchain staging, signing secrets, installer creation, packaged-backend smoke testing, and the release checklist.

## Repository layout

```text
app/              Electron/React application, tests, and packaging scripts
examples/         Genuine HDL projects used by integration tests and smoke tests
docs/             Contributor-facing architecture and design documentation
.github/         Issue templates, CI, and native package workflows
```

## License

OpenBench is free software licensed under the [GNU General Public License v3.0](LICENSE). You may use, study, modify, and redistribute it under the terms of that license. OpenBench is provided without warranty.
