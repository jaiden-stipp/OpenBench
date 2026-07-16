const path = require('node:path');

function resolveInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  ) {
    return resolvedCandidate;
  }
  throw new Error('Path is outside the active project.');
}

function isAllowedNavigation(targetUrl, developmentUrl, packagedEntryUrl) {
  try {
    const target = new URL(targetUrl);
    const allowed = new URL(developmentUrl || packagedEntryUrl);
    if (developmentUrl) return target.origin === allowed.origin;
    return (
      target.protocol === 'file:' &&
      target.pathname === allowed.pathname &&
      target.search === allowed.search
    );
  } catch {
    return false;
  }
}

module.exports = { isAllowedNavigation, resolveInside };
