# RTLDeck maintainer and packaging guide

Packaging is a release step, not part of the normal edit/test loop. Most changes only need the development checks below. Build an installer when you intentionally want a new distributable artifact.

## Day-to-day development

From `app`:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

Before sharing or committing a change:

```powershell
pnpm build
pnpm test
```

`pnpm build` runs the TypeScript check and creates the production renderer under `app/dist`. `pnpm test` includes genuine Icarus, Verilator, Yosys, VCD, project-management, and persistence tests; it is not a mocked UI-only suite.

## Native toolchain

RTLDeck packages a platform-native YosysHQ OSS CAD Suite so users do not need to install simulators or edit `PATH`.

Place the extracted suite at:

```text
.toolchain/oss-cad-suite/
```

Alternatively, set `RTLDECK_TOOLCHAIN_SOURCE` to the absolute extraction path. Stage the suite before packaging:

```powershell
pnpm toolchain:stage
```

The staged copy is written to `app/.rtldeck-toolchain/oss-cad-suite`. Never put a Windows suite in a Linux package or a Linux suite in a Windows package.

## Build the Windows installer

Run this from Windows inside `app` after configuring an Authenticode certificate:

```powershell
$env:WIN_CSC_LINK = "C:\secure\rtldeck-signing-certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "<certificate password>"
pnpm package:win
```

The release command deliberately refuses to continue without signing credentials. It signs and verifies the unpacked application and NSIS installer, scans the entire unpacked application and installer with the locally installed Microsoft Defender engine, and writes `SHA256SUMS.txt`.

For local packaging tests that must never be distributed, use `pnpm package:win:unsigned:dir`. The explicit `unsigned` name is intentional.

Outputs:

```text
app/release/RTLDeck-<version>-Windows-x64.exe
app/release/win-unpacked/RTLDeck.exe
```

The unpacked executable is useful for validation because it runs the same packaged application without installing it.

## Packaged-backend smoke test

Do not accept a package based only on whether its window opens. Run a genuine project and confirm a new VCD was created.

From `app` in PowerShell:

```powershell
$capture = (Resolve-Path ..\outputs).Path + '\rtldeck-package-smoke.png'
$env:RTLDECK_TEST_PROJECT = (Resolve-Path ..\examples\phase0).Path
$env:RTLDECK_TEST_ACTION = 'simulation'
$env:RTLDECK_CAPTURE_PATH = $capture
Start-Process -FilePath (Resolve-Path .\release\win-unpacked\RTLDeck.exe).Path -ArgumentList @('--disable-gpu', '--no-sandbox')
```

Then verify:

- the capture exists and shows the waveform viewer;
- a new nonempty VCD exists under `examples/phase0/.rtldeck-runs/`;
- the console command paths point into `release/win-unpacked/resources/oss-cad-suite`.

Generate a checksum before distributing the installer:

```powershell
Get-FileHash -Algorithm SHA256 .\release\RTLDeck-*-Windows-x64.exe
```

## Linux and macOS

Build each package on its native operating system with that operating system's OSS CAD Suite:

```bash
# Linux: install current ClamAV definitions and configure a release-signing key.
export LINUX_GPG_PRIVATE_KEY="$(cat /secure/rtldeck-release-key.asc)"
export LINUX_GPG_PASSPHRASE="<key passphrase>"
export LINUX_GPG_KEY_ID="<optional key fingerprint>"
pnpm package:linux

# macOS: configure Developer ID and Apple notarization credentials.
export CSC_LINK="/secure/rtldeck-developer-id.p12"
export CSC_KEY_PASSWORD="<certificate password>"
export APPLE_ID="<Apple developer account>"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific password>"
export APPLE_TEAM_ID="<team ID>"
pnpm package:mac
```

Linux produces a Debian package and tarball. The native workflow installs the `.deb`, runs a genuine bundled-backend simulation through the installed application, scans the unpacked application and both artifacts with ClamAV, writes SHA-256 checksums, signs the checksum manifest with an isolated temporary GPG keyring, and verifies that signature. The tarball is the no-FUSE fallback for non-Debian distributions. Linux does not have one universal publisher-reputation service equivalent to SmartScreen, so users must receive the public signing key through a trusted channel. For local testing only, use `pnpm package:linux:unsigned:dir`.

macOS produces DMG and ZIP artifacts with hardened runtime enabled. The release command requires Developer ID signing and notarization credentials, then verifies the application with `codesign` and Gatekeeper (`spctl`), validates the stapled notarization ticket on the DMG, and writes SHA-256 checksums. For local testing only, use `pnpm package:mac:unsigned:dir`. Apple requires Developer ID signing, hardened runtime, and notarization for normal direct distribution; see [Apple's notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

The repository workflow at `../.github/workflows/native-packages.yml` is the preferred repeatable path once its platform signing secrets are configured.

Do not call a platform validated until its packaged executable completes a genuine bundled-backend simulation and produces a new nonempty VCD. macOS also needs signing/notarization before normal public distribution.

## Release checklist

1. Run `pnpm build` and `pnpm test`.
2. Confirm the correct native OSS CAD Suite is staged.
3. Run the platform packaging command.
4. Smoke-test the unpacked packaged executable against a real HDL project.
5. Confirm the platform signature/notarization checks, malware scan, and generated SHA-256 checksum.
6. Copy the installer into `outputs/` only when it is the version you intend to hand off.
7. Update the relevant status document and release notes.

## Windows Defender and SmartScreen

Authenticode signing and a clean Defender scan materially reduce warnings, but no build system can guarantee acceptance by every future Defender definition or by SmartScreen's online reputation service. Microsoft documents that SmartScreen considers both publisher and per-file reputation, so even a newly signed binary can initially show a prompt. Bundled compiler binaries make release-by-release scanning especially important. See Microsoft's [SmartScreen reputation guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation) and [Windows code-signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options).

For public releases:

1. use an Authenticode certificate whose subject matches the configured publisher name;
2. store `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` as GitHub Actions secrets;
3. let the native-package workflow reject unsigned or Defender-detected artifacts;
4. test SmartScreen on a clean Windows machine;
5. submit any false positive through the [Microsoft Security Intelligence file submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission) before publishing the installer.
