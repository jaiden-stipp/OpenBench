# OpenBench architecture

OpenBench is split into a trusted Electron main process and a sandboxed React renderer. The boundary between them is intentionally explicit: renderer code calls the typed `window.rtlbench` API exposed by the preload script, while filesystem and process execution stay in Electron.

## Repository map

```text
app/
  electron/          Main-process services and the preload IPC bridge
  scripts/           Packaging and native-toolchain staging utilities
  src/
    components/      Reusable application chrome and focused UI components
    editor/          Monaco language setup and source-learning helpers
    types/           Renderer-only shared TypeScript types
    *.tsx             Feature panels and top-level application orchestration
    *.js              Framework-independent parsers and graph utilities
  tests/             Unit and genuine-backend integration tests
examples/
  fixtures/          Small beginner HDL projects used by integration tests
  phase0/            Backend round-trip smoke project and scripts
.toolchain/          Local OSS CAD Suite extraction; ignored by Git
```

## Runtime boundaries

1. `app/electron/main.cjs` registers IPC handlers and coordinates project, compiler, simulator, and Yosys services.
2. `app/electron/preload.cjs` exposes the smallest renderer API needed for those operations.
3. `app/src/App.tsx` owns application-level state and coordinates feature panels.
4. Focused components under `app/src/components/` render project navigation, run controls, and console output.
5. VCD parsing runs in `app/src/vcd.worker.ts` so large simulations do not block the UI.
6. Schematic data comes only from Yosys JSON and is laid out by ELK.

## Contributor conventions

- Keep `App.tsx` focused on orchestration. Put self-contained UI in `components/`, editor integration in `editor/`, and pure data transformations in framework-independent modules.
- Prefer named interfaces over large inline object types.
- Break JSX props onto separate lines when a component has more than three props.
- Use early returns and one statement per line in asynchronous workflows.
- Keep backend output truthful: translations may supplement raw tool output but never replace it.
- Tests that claim simulation or synthesis behavior must execute a genuine backend against real HDL.
- Add an IPC capability by changing the main handler, preload bridge, and `global.d.ts` together.

## Where to start

- Project/filesystem behavior: `app/electron/projectManager.cjs`
- Compilation and error translation: `app/electron/compiler.cjs` and `errorTranslator.cjs`
- Simulation and VCD generation: `app/electron/simulator.cjs`
- Waveform UI: `app/src/WaveformPanel.tsx`
- RTL graph construction/rendering: `app/src/netlistGraph.js` and `SchematicPanel.tsx`
- Beginner guidance: `app/src/GuidanceCenter.tsx` and `projectInsights.js`

Run `pnpm build` and `pnpm test` from `app/` before submitting a pull request.
