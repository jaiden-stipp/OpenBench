# OpenBench application

This directory contains the Electron, React, Monaco, ELK, and native-backend integration for OpenBench. The repository-level [README](../README.md) provides the project overview and clone-to-build instructions.

## Beginner workflow

On the first launch, an optional four-step tutorial introduces the source-to-waveform workflow. It can be skipped immediately and reopened later from **Help → Getting Started Tutorial**. **Help → Open Example Project** opens a genuine editable counter/testbench project that runs with the bundled Icarus backend.

1. Choose **File → New Project**.
2. Keep **Create runnable starter** enabled.
3. Press **Run Simulation**.

The starter contains synthesizable HDL, an editable procedural testbench, VCD setup, and working project settings. Packaged builds discover their embedded OSS CAD Suite, so students do not need to configure `PATH` or install a simulator separately.

## Project model

- `.openbench.json` stores the project name, explicitly included HDL files, and persistent folders.
- Existing folders open with a checklist of discovered `.v`, `.sv`, `.vh`, and `.svh` files.
- The Project sidebar creates files and empty/nested folders. Context menus support rename, duplicate, copy path, reveal, and operating-system trash.
- Rename, create, import, and removal operations keep file and folder manifest entries synchronized.
- All project-relative paths are constrained to the project root.

## Simulation and waveform viewing

- Compile/lint uses genuine Icarus or Verilator processes.
- Simulation executes the compiled design and parses the resulting real VCD.
- The waveform viewer supports zoom, cursors, value inspection, radix changes, search, grouping, reordering, X/Z help, and UI-created compiled conditions.
- Watch mode recompiles, reruns, and refreshes after saves when enabled.

## RTL schematic

- Yosys performs elaboration and writes the JSON netlist; OpenBench does not infer RTL by parsing HDL text.
- ELK lays out the graph using fixed anchors derived from Yosys port metadata.
- Primitive symbols are the blocks themselves: mux trapezoids, register blocks, logic gates, arithmetic nodes, memories, comparisons, and hierarchical modules.
- Mux data pins enter from the left, the output exits right, and select enters from the bottom.
- Pin labels show input/output color, name, and bus width at the connection point.
- Clicking blocks and nets retains source/waveform cross-probing.

## Diagnostics

Raw backend output remains visible. An explicit pattern list adds beginner-oriented `EXPLAIN` rows and clickable source locations without hiding the ground truth. Unmatched error-looking lines are recorded under `.openbench-runs/` so translations can be extended deliberately.

## Continuity and safety

- Open source tabs, the active view, editor cursor, waveform ordering/radix/groups, zoom, and waveform cursor are restored after a restart.
- Edits are crash-recovered after a short pause and autosaved to the project after 900 ms of inactivity.
- Autosave invokes the selected real simulator backend for inline linting; Monaco shows source-line diagnostics without replacing the raw compile console.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm start
```

Packaging requires a native OSS CAD Suite extraction. Put it in `../.toolchain/oss-cad-suite` or set `OPENBENCH_TOOLCHAIN_SOURCE`, then run:

```bash
pnpm toolchain:stage
pnpm package:win       # Windows
pnpm package:linux     # Linux; requires GPG credentials and ClamAV
pnpm package:mac       # macOS; requires Developer ID and notarization credentials
```

Release commands refuse missing platform trust credentials. Explicit `package:*:unsigned:dir` commands exist only for local packaging tests; never distribute those outputs. See the repository [packaging and release-security guide](../docs/PACKAGING.md).

## Current verification

- 49 tests pass on Windows, including real Icarus, Verilator, Yosys, session recovery, learning projects, project health, and editable-example integration.
- Linux x86_64 has completed a genuine packaged-runtime Icarus/VCD run. The native release workflow installs the `.deb` and repeats that test before upload.
- Windows x64 has completed genuine packaged Icarus/VCD and Yosys/mux-rendering runs.
- The VCD benchmark covers 50,000 timestamps.

The signed release gates are configured, but signed Windows/macOS packages and the macOS packaged-backend run remain unvalidated until real signing credentials are supplied on their native runners.
