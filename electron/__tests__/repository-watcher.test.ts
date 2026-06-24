import { createRequire } from 'node:module';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { normalizeRepositoryWatcherPath, repositoryWatcherSnapshotsMatchExpectedWrites } =
  require('../repository-watcher.cjs') as {
    normalizeRepositoryWatcherPath: (path: string) => string;
    repositoryWatcherSnapshotsMatchExpectedWrites: (
      left: { head: string; pathSignatures: Record<string, string> },
      right: { head: string; pathSignatures: Record<string, string> },
      expectedPathVersions: ReadonlyMap<string, string>,
    ) => boolean;
  };

const planVersion = '1234567890abcdef'.padEnd(64, '0');
const planSignature = ['docs/plan.md', 'file', '33188', '5', planVersion.slice(0, 16)].join('\0');
const baseline = {
  head: 'head',
  pathSignatures: {
    'docs/plan.md': 'old-plan',
    'src/app.ts': 'old-app',
  },
};

test('normalizes repository watcher paths', () => {
  expect(normalizeRepositoryWatcherPath('docs\\plan.md')).toBe('docs/plan.md');
});

test('ignores only expected app-written paths', () => {
  expect(
    repositoryWatcherSnapshotsMatchExpectedWrites(
      baseline,
      {
        ...baseline,
        pathSignatures: {
          ...baseline.pathSignatures,
          'docs/plan.md': planSignature,
        },
      },
      new Map([['docs/plan.md', planVersion]]),
    ),
  ).toBe(true);

  expect(
    repositoryWatcherSnapshotsMatchExpectedWrites(
      baseline,
      {
        ...baseline,
        pathSignatures: {
          'docs/plan.md': planSignature,
          'src/app.ts': 'new-app',
        },
      },
      new Map([['docs/plan.md', planVersion]]),
    ),
  ).toBe(false);
});

test('does not ignore a different write to the expected path', () => {
  expect(
    repositoryWatcherSnapshotsMatchExpectedWrites(
      baseline,
      {
        ...baseline,
        pathSignatures: {
          ...baseline.pathSignatures,
          'docs/plan.md': ['docs/plan.md', 'file', '33188', '8', 'external-change'].join('\0'),
        },
      },
      new Map([['docs/plan.md', planVersion]]),
    ),
  ).toBe(false);
});

test('never ignores repository HEAD changes', () => {
  expect(
    repositoryWatcherSnapshotsMatchExpectedWrites(
      baseline,
      {
        ...baseline,
        head: 'new-head',
        pathSignatures: {
          ...baseline.pathSignatures,
          'docs/plan.md': planSignature,
        },
      },
      new Map([['docs/plan.md', planVersion]]),
    ),
  ).toBe(false);
});
