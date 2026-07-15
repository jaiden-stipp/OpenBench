const path = require('node:path');

function resolveInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return resolvedCandidate;
  }
  throw new Error('Path is outside the active project.');
}

module.exports = { resolveInside };
