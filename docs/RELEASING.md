# Publishing an RTLDeck release

RTLDeck builds each public package on its native operating system. Do not upload files produced by an unsigned development command.

## Required GitHub Actions secrets

Configure these under **Repository settings → Secrets and variables → Actions**:

### Windows

- `WINDOWS_CSC_LINK`: base64 data or a secure URL accepted by Electron Builder for the Authenticode certificate.
- `WINDOWS_CSC_KEY_PASSWORD`: certificate password.

The certificate subject must match `build.win.signtoolOptions.publisherName` in `app/package.json`.

### Linux

- `LINUX_GPG_PRIVATE_KEY`: ASCII-armored private release-signing key.
- `LINUX_GPG_PASSPHRASE`: private-key passphrase.
- `LINUX_GPG_KEY_ID`: full fingerprint of the signing key; recommended when the imported key contains multiple signing identities.

Publish the corresponding public key and fingerprint through a trusted project page. The Linux release contains `SHA256SUMS.txt` and `SHA256SUMS.txt.asc` so users can verify downloads independently.

### macOS

- `MACOS_CSC_LINK`: Developer ID Application certificate accepted by Electron Builder.
- `MACOS_CSC_KEY_PASSWORD`: certificate password.
- `APPLE_ID`: Apple Developer account used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that account.
- `APPLE_TEAM_ID`: Apple Developer team identifier.

App Store Connect API credentials or a `notarytool` keychain profile are also supported by the local guard, but the checked-in GitHub workflow currently uses the Apple ID credential set above.

## Produce the native packages

1. Update `app/package.json` with the intended semantic version.
2. Run `pnpm format:check`, `pnpm build`, and `pnpm test` from `app/`.
3. Commit and push the release changes.
4. Open **Actions → Native RTLDeck packages → Run workflow** for a preview build.
5. Download and inspect all three workflow artifacts.
6. For a release build, create and push a matching tag such as `v0.1.0`.

The workflow produces:

- Windows x64 NSIS installer, Authenticode signature verification, Defender scan, and checksums.
- Linux x64 Debian package and tarball, native `.deb` installation, ClamAV scan, GPG-signed checksums, and a real installed bundled-backend run.
- macOS arm64 DMG and ZIP, Developer ID validation, Gatekeeper assessment, notarization-ticket validation, and checksums.

The workflow fails instead of uploading a platform artifact when its signing, scanning, notarization, genuine-backend test, or checksum stage fails.

## Local development packages

The following commands are intentionally unsigned and must not be uploaded:

```text
pnpm package:win:unsigned:dir
pnpm package:linux:unsigned:dir
pnpm package:mac:unsigned:dir
```

See [PACKAGING.md](PACKAGING.md) for platform-specific release validation and troubleshooting.
