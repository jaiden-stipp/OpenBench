const hasCertificate = Boolean(process.env.WIN_CSC_LINK || process.env.CSC_LINK);
const hasPassword = Boolean(process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD);

if (process.platform !== 'win32') {
  console.error('Signed Windows releases must be built and verified on Windows.');
  process.exit(1);
}

if (!hasCertificate || !hasPassword) {
  console.error(
    [
      'Refusing to create an unsigned RTLDeck Windows release.',
      'Set WIN_CSC_LINK (or CSC_LINK) to the Authenticode certificate and',
      'WIN_CSC_KEY_PASSWORD (or CSC_KEY_PASSWORD) to its password.',
      'For local UI testing only, use pnpm package:win:unsigned:dir.',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Windows signing credentials are configured; release packaging may continue.');
