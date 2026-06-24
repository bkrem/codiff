import { chmod, lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { readMarkdownDocument, writeMarkdownDocument } = require('../markdown-document.cjs') as {
  readMarkdownDocument: (
    request: { kind: 'plan' | 'repository'; path: string },
    context: { planFile?: string; repositoryRoot: string },
  ) => Promise<{
    content: string;
    id: string;
    kind: 'plan' | 'repository';
    path: string;
    version: string;
  }>;
  writeMarkdownDocument: (
    request: {
      baseVersion: string;
      content: string;
      kind: 'plan' | 'repository';
      path: string;
    },
    context: { planFile?: string; repositoryRoot: string },
  ) => Promise<{
    content: string;
    id: string;
    kind: 'plan' | 'repository';
    path: string;
    version: string;
  }>;
};

test('reads and atomically writes repository Markdown documents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codiff-markdown-'));
  const path = join(root, 'plan.md');
  const context = { repositoryRoot: root };

  try {
    await writeFile(path, '# Original\n');
    const document = await readMarkdownDocument({ kind: 'repository', path: 'plan.md' }, context);
    const saved = await writeMarkdownDocument(
      {
        baseVersion: document.version,
        content: '# Updated\n',
        kind: 'repository',
        path: 'plan.md',
      },
      context,
    );

    expect(saved.content).toBe('# Updated\n');
    expect(saved.version).not.toBe(document.version);
    expect(await readFile(path, 'utf8')).toBe('# Updated\n');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('preserves repository Markdown file permissions when saving', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codiff-markdown-mode-'));
  const path = join(root, 'executable.md');
  const context = { repositoryRoot: root };

  try {
    await writeFile(path, '# Original\n');
    await chmod(path, 0o755);
    const document = await readMarkdownDocument(
      { kind: 'repository', path: 'executable.md' },
      context,
    );

    await writeMarkdownDocument(
      {
        baseVersion: document.version,
        content: '# Updated\n',
        kind: 'repository',
        path: 'executable.md',
      },
      context,
    );

    expect((await stat(path)).mode & 0o777).toBe(0o755);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('writes through a symlinked plan without replacing the symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codiff-plan-symlink-'));
  const target = join(root, 'target.md');
  const planFile = join(root, 'plan.md');
  const context = { planFile, repositoryRoot: root };

  try {
    await writeFile(target, '# Original\n');
    await symlink(target, planFile);
    const document = await readMarkdownDocument({ kind: 'plan', path: planFile }, context);

    await writeMarkdownDocument(
      {
        baseVersion: document.version,
        content: '# Updated\n',
        kind: 'plan',
        path: planFile,
      },
      context,
    );

    expect((await lstat(planFile)).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('# Updated\n');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('returns the disk document when a stale version attempts to overwrite it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codiff-markdown-conflict-'));
  const path = join(root, 'plan.md');
  const context = { repositoryRoot: root };

  try {
    await writeFile(path, '# Original\n');
    const document = await readMarkdownDocument({ kind: 'repository', path: 'plan.md' }, context);
    await writeFile(path, '# External edit\n');

    await expect(
      writeMarkdownDocument(
        {
          baseVersion: document.version,
          content: '# Local edit\n',
          kind: 'repository',
          path: 'plan.md',
        },
        context,
      ),
    ).rejects.toMatchObject({
      document: {
        content: '# External edit\n',
      },
      name: 'MarkdownDocumentConflictError',
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('allows only the exact plan file and repository-contained Markdown paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codiff-markdown-paths-'));
  const planFile = join(root, 'plan.md');

  try {
    await writeFile(planFile, '# Plan\n');
    await expect(
      readMarkdownDocument(
        { kind: 'plan', path: join(root, 'other.md') },
        { planFile, repositoryRoot: root },
      ),
    ).rejects.toThrow('does not belong to this window');
    await expect(
      readMarkdownDocument({ kind: 'repository', path: '../plan.md' }, { repositoryRoot: root }),
    ).rejects.toThrow('escapes the repository');
    await expect(
      readMarkdownDocument({ kind: 'repository', path: 'plan.txt' }, { repositoryRoot: root }),
    ).rejects.toThrow('Invalid repository Markdown path');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('rejects repository Markdown paths that resolve outside through a symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codiff-markdown-symlink-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'codiff-markdown-symlink-outside-'));
  const outsidePath = join(outside, 'outside.md');

  try {
    await writeFile(outsidePath, '# Outside\n');
    await symlink(outside, join(root, 'docs'));

    await expect(
      readMarkdownDocument(
        { kind: 'repository', path: 'docs/outside.md' },
        { repositoryRoot: root },
      ),
    ).rejects.toThrow('escapes the repository');
    expect(await readFile(outsidePath, 'utf8')).toBe('# Outside\n');
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});
