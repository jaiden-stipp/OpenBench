# OpenBench maintainer and packaging guide

Packaging is a release step, not part of the normal edit/test loop. Most changes only need the development checks below. Build an installer when you intentionally want a new distributable artifact.

## Day-to-day development

From `work/openbench`:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

Before sharing or committing a change:

```powershell
pnpm build
pnpm test
```

`pnpm build` runs the TypeScript check and creates the production renderer under `work/openbench/dist`. `pnpm test` includes genuine Icarus, Verilator, Yosys, VCD, project-management, and persistence tests; it is not a mocked UI-only suite.

## Native toolchain

OpenBench packages a platform-native YosysHQ OSS CAD Suite so users do not need to install simulators or edit `PATH`.

Place the extracted suite at:

```text
work/toolchain/oss-cad-suite/
```

Alternatively, set `OPENBENCH_TOOLCHAIN_SOURCE` to the absolute extraction path. Stage the suite before packaging:

```powershell
pnpm toolchain:stage
```

The staged copy is written to `work/openbench/.openbench-toolchain/oss-cad-suite`. Never put a Windows suite in a Linux package or a Linux suite in a Windows package.

## Build the Windows installer

Run this from Windows inside `work/openbench`:

```powershell
pnpm package:win
```

Outputs:

```text
work/openbench/release/OpenBench-<version>-Windows-x64.exe
work/openbench/release/win-unpacked/OpenBench.exe
```

The unpacked executable is useful for validation because it runs the same packaged application without installing it.

## Packaged-backend smoke test

Do not accept a package based only on whether its window opens. Run a genuine project and confirm a new VCD was created.

From `work/openbench` in PowerShell:

```powershell
$capture = (Resolve-Path ..\..\outputs).Path + '\openbench-package-smoke.png'
$env:OPENBENCH_TEST_PROJECT = (Resolve-Path ..\phase0).Path
$env:OPENBENCH_TEST_ACTION = 'simulation'
$env:OPENBENCH_CAPTURE_PATH = $capture
Start-Process -FilePath (Resolve-Path .\release\win-unpacked\OpenBench.exe).Path -ArgumentList @('--disable-gpu', '--no-sandbox')
```

Then verify:

- the capture exists and shows the waveform viewer;
- a new nonempty VCD exists under `work/phase0/.openbench-runs/`;
- the console command paths point into `release/win-unpacked/resources/oss-cad-suite`.

Generate a checksum before distributing the installer:

```powershell
Get-FileHash -Algorithm SHA256 .\release\OpenBench-*-Windows-x64.exe
```

## Linux and macOS

Build each package on its native operating system with that operating system's OSS CAD Suite:

```bash
pnpm package:linux
pnpm package:mac
```

Linux produces an AppImage and tarball. macOS produces DMG and ZIP artifacts. The repository workflow at `.github/workflows/native-packages.yml` is the preferred repeatable path once the repository is on GitHub.

Do not call a platform validated until its packaged executable completes a genuine bundled-backend simulation and produces a new nonempty VCD. macOS also needs signing/notarization before normal public distribution.

## Release checklist

1. Run `pnpm build` and `pnpm test`.
2. Confirm the correct native OSS CAD Suite is staged.
3. Run the platform packaging command.
4. Smoke-test the unpacked packaged executable against a real HDL project.
5. Record the artifact size and SHA-256 checksum.
6. Copy the installer into `outputs/` only when it is the version you intend to hand off.
7. Update the relevant status document and release notes.

Preview installers are currently unsigned, so Windows reputation warnings are expected.
