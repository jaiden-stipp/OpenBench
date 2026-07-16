# Contributing to OpenBench

Thank you for helping make Verilog simulation easier to approach.

## Before opening an issue

- Search existing issues for the same problem.
- Use the latest release or current `main` branch when possible.
- Remove private, proprietary, or course-restricted HDL from examples.
- For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer
- A platform-native [YosysHQ OSS CAD Suite](https://github.com/YosysHQ/oss-cad-suite-build) extraction for genuine backend tests

```bash
cd app
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm format:check
pnpm start
```

Put the native suite at `.toolchain/oss-cad-suite`, or set `OPENBENCH_TOOLCHAIN_SOURCE` to its absolute path.

## Pull requests

1. Keep changes focused and explain the user-facing reason.
2. Preserve raw simulator/Yosys output when adding friendlier explanations.
3. Do not replace genuine backend results with mocked waveforms or netlists.
4. Add or update tests for behavior changes.
5. Run `pnpm format:check`, `pnpm lint`, `pnpm build`, and `pnpm test` from `app`.
6. Update user documentation when workflows or supported behavior change.

## Code organization

- Treat roughly 100 lines as a review threshold for a function or React component.
- When a function approaches that size, extract behavior by responsibility into named helpers, hooks, or child components. Avoid arbitrary line-count splits that hide shared state or create unclear parameter lists.
- Keep `App.tsx` as integration wiring. Project lifecycle, backend events, editor behavior, persistence, and presentation belong in focused modules under `src/hooks` and `src/components`.
- Prefer descriptive domain names over abbreviations, and keep raw backend interaction separate from UI presentation.
- Use `window.openbench` and `openbench.*` names in new code. Keep legacy `rtlbench` aliases inside the preload or compatibility modules rather than spreading them into new features.

The core product goal is to reduce the distance between having an HDL idea and seeing it work. Commercial-EDA complexity that does not improve that beginner workflow may be out of scope.

By contributing, you agree that your contribution is licensed under GPL-3.0-only.
