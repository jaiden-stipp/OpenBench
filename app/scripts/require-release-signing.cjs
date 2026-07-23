const platform = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (platform === 'linux') {
  if (process.platform !== 'linux') fail('Linux releases must be built and verified on Linux.');
  if (!process.env.LINUX_GPG_PRIVATE_KEY || !process.env.LINUX_GPG_PASSPHRASE) {
    fail(
      [
        'Refusing to create an unsigned RTLDeck Linux release.',
        'Set LINUX_GPG_PRIVATE_KEY to an armored private key and LINUX_GPG_PASSPHRASE',
        'to its passphrase. For local testing, use pnpm package:linux:unsigned:dir.',
      ].join('\n'),
    );
  }
  console.log('Linux signing credentials are configured; release packaging may continue.');
  process.exit(0);
}

if (platform === 'mac') {
  if (process.platform !== 'darwin') fail('macOS releases must be built and verified on macOS.');
  const hasCertificate = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);
  const hasApiCredentials = Boolean(
    process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER,
  );
  const hasAppleIdCredentials = Boolean(
    process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
  );
  const hasKeychainCredentials = Boolean(
    process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE,
  );

  if (!hasCertificate) {
    fail('Refusing to create a macOS release without CSC_LINK and CSC_KEY_PASSWORD.');
  }
  if (!hasApiCredentials && !hasAppleIdCredentials && !hasKeychainCredentials) {
    fail(
      [
        'Refusing to create a macOS release without Apple notarization credentials.',
        'Configure App Store Connect API credentials, Apple ID credentials, or a notarytool',
        'keychain profile. For local testing, use pnpm package:mac:unsigned:dir.',
      ].join('\n'),
    );
  }
  console.log('macOS signing and notarization credentials are configured.');
  process.exit(0);
}

fail('Usage: node scripts/require-release-signing.cjs <linux|mac>');
