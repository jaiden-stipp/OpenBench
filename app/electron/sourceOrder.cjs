const fsp = require('node:fs/promises');
const path = require('node:path');

const PACKAGE_DECLARATION = /\bpackage\s+([A-Za-z_$][\w$]*)\s*;/g;
const PACKAGE_IMPORT = /\bimport\s+([A-Za-z_$][\w$]*)\s*::/g;

async function orderSourceFiles(projectRoot, files) {
  const sources = await Promise.all(
    files.map(async (file, index) => ({
      file,
      index,
      content: await fsp.readFile(path.resolve(projectRoot, file), 'utf8'),
    })),
  );
  const providers = new Map();
  for (const source of sources)
    for (const packageName of matches(source.content, PACKAGE_DECLARATION))
      providers.set(packageName, source.file);

  const pending = new Map(sources.map((source) => [source.file, source]));
  const ordered = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((source) =>
      matches(source.content, PACKAGE_IMPORT).every(
        (packageName) =>
          !pending.has(providers.get(packageName)) || providers.get(packageName) === source.file,
      ),
    );
    const next = (ready.length ? ready : [...pending.values()]).sort(
      (left, right) => left.index - right.index,
    )[0];
    ordered.push(next.file);
    pending.delete(next.file);
  }
  return ordered;
}

function matches(content, pattern) {
  return [...content.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => match[1]);
}

module.exports = { orderSourceFiles };
