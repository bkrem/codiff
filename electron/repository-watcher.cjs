// @ts-check

/** @param {string} path */
const normalizeRepositoryWatcherPath = (path) => path.replaceAll('\\', '/');

/**
 * @param {{head: string; pathSignatures: Record<string, string>}} left
 * @param {{head: string; pathSignatures: Record<string, string>}} right
 * @param {ReadonlyMap<string, string>} expectedPathVersions
 */
const repositoryWatcherSnapshotsMatchExpectedWrites = (left, right, expectedPathVersions) => {
  if (left.head !== right.head) {
    return false;
  }

  for (const [path, version] of expectedPathVersions) {
    const signatureParts = right.pathSignatures[path]?.split('\0');
    if (signatureParts?.[1] !== 'file' || signatureParts.at(-1) !== version.slice(0, 16)) {
      return false;
    }
  }

  const paths = new Set([
    ...Object.keys(left.pathSignatures),
    ...Object.keys(right.pathSignatures),
  ]);
  for (const path of paths) {
    if (
      !expectedPathVersions.has(normalizeRepositoryWatcherPath(path)) &&
      left.pathSignatures[path] !== right.pathSignatures[path]
    ) {
      return false;
    }
  }

  return true;
};

module.exports = {
  normalizeRepositoryWatcherPath,
  repositoryWatcherSnapshotsMatchExpectedWrites,
};
