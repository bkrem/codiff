import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vite-plus/test';
import { getGitTestEnvironment, removeGitTestDirectory } from '../../core/__tests__/helpers/git.ts';

const require = createRequire(import.meta.url);
const { diagnoseWalkthroughMismatch } = require('../walkthrough-diagnosis.cjs') as {
  diagnoseWalkthroughMismatch: (params: {
    hasFiles: boolean;
    input: unknown;
    repositoryRoot: string;
  }) => Promise<string | null>;
};

const execFileAsync = promisify(execFile);

const git = async (repo: string, args: ReadonlyArray<string>) => {
  await execFileAsync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: getGitTestEnvironment(),
  });
};

const makeRepo = async () => {
  const repo = await mkdtemp(join(tmpdir(), 'codiff-diagnosis-'));
  await git(repo, ['init']);
  return repo;
};

const walkthroughFor = (path: string, extra: Record<string, unknown> = {}) => ({
  source: { kind: 'working-tree' },
  chapters: [{ stops: [{ anchors: [{ path }] }] }],
  ...extra,
});

const v4WalkthroughFor = (path: string, extra: Record<string, unknown> = {}) => ({
  source: { type: 'working-tree' },
  chapters: [{ stops: [{ hunkIds: [`${path}:staged:h1`] }] }],
  version: 4,
  ...extra,
});

test('reports changes committed after the walkthrough was authored', async () => {
  const repo = await makeRepo();
  try {
    await writeFile(join(repo, 'feature.ts'), 'export const value = 1;\n');
    await git(repo, ['add', 'feature.ts']);
    await git(repo, ['commit', '-m', 'Add the feature']);

    const reason = await diagnoseWalkthroughMismatch({
      hasFiles: false,
      // Authored well before the commit above, so it counts as committed-after.
      input: walkthroughFor('feature.ts', { generatedAt: '2000-01-01T00:00:00.000Z' }),
      repositoryRoot: repo,
    });

    expect(reason).toContain('committed since the walkthrough was authored');
    expect(reason).toContain('Add the feature');
  } finally {
    await removeGitTestDirectory(repo);
  }
});

test('reports v4 hunk-id changes committed after the walkthrough was authored', async () => {
  const repo = await makeRepo();
  try {
    await writeFile(join(repo, 'feature.ts'), 'export const value = 1;\n');
    await git(repo, ['add', 'feature.ts']);
    await git(repo, ['commit', '-m', 'Add the v4 feature']);

    const reason = await diagnoseWalkthroughMismatch({
      hasFiles: false,
      input: v4WalkthroughFor('feature.ts', { generatedAt: '2000-01-01T00:00:00.000Z' }),
      repositoryRoot: repo,
    });

    expect(reason).toContain('committed since the walkthrough was authored');
    expect(reason).toContain('Add the v4 feature');
  } finally {
    await removeGitTestDirectory(repo);
  }
});

test('treats a commit that predates authoring as reverted, not committed', async () => {
  const repo = await makeRepo();
  try {
    await writeFile(join(repo, 'feature.ts'), 'export const value = 1;\n');
    await git(repo, ['add', 'feature.ts']);
    await git(repo, ['commit', '-m', 'Old commit']);

    const reason = await diagnoseWalkthroughMismatch({
      hasFiles: false,
      // Authored far in the future relative to the only commit touching the file.
      input: walkthroughFor('feature.ts', { generatedAt: '2999-01-01T00:00:00.000Z' }),
      repositoryRoot: repo,
    });

    expect(reason).toContain('reverted');
    expect(reason).not.toContain('committed since');
  } finally {
    await removeGitTestDirectory(repo);
  }
});

test('reports never-committed paths as reverted or discarded', async () => {
  const repo = await makeRepo();
  try {
    await git(repo, ['commit', '--allow-empty', '-m', 'initial']);

    const reason = await diagnoseWalkthroughMismatch({
      hasFiles: false,
      input: walkthroughFor('untracked.ts'),
      repositoryRoot: repo,
    });

    expect(reason).toContain('reverted or discarded');
  } finally {
    await removeGitTestDirectory(repo);
  }
});

test('defers to the caller when the diff still has files', async () => {
  const repo = await makeRepo();
  try {
    expect(
      await diagnoseWalkthroughMismatch({
        hasFiles: true,
        input: walkthroughFor('feature.ts'),
        repositoryRoot: repo,
      }),
    ).toBeNull();
  } finally {
    await removeGitTestDirectory(repo);
  }
});
