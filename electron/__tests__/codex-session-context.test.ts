import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { readCodexSessionContext } = require('../codex-session-context.cjs') as {
  readCodexSessionContext: (sessionId?: string) => Promise<{
    messages?: ReadonlyArray<{ role: 'assistant' | 'user'; text: string }>;
    risks?: ReadonlyArray<string>;
    source: { threadId?: string; type: string };
    version: 1;
  } | null>;
};

const sessionId = '019e5e57-e7d6-7392-9ad1-ad959319d2fb';

test('extracts bounded readable messages from Codex session jsonl', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-session-'));
  const sessionDirectory = join(directory, 'sessions', '2026', '05', '25');
  const sessionPath = join(sessionDirectory, `rollout-${sessionId}.jsonl`);
  const previousCodexHome = process.env.CODEX_HOME;

  try {
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(
      sessionPath,
      [
        JSON.stringify({
          payload: {
            content: [{ text: 'Implement walkthrough session handoff.', type: 'input_text' }],
            role: 'user',
            type: 'message',
          },
          type: 'response_item',
        }),
        JSON.stringify({
          payload: {
            content: [{ text: 'Updated the CLI and skill handoff.', type: 'output_text' }],
            role: 'assistant',
            type: 'message',
          },
          type: 'response_item',
        }),
        JSON.stringify({
          payload: {
            content: [{ text: 'Internal developer instruction.', type: 'input_text' }],
            role: 'developer',
            type: 'message',
          },
          type: 'response_item',
        }),
        JSON.stringify({
          payload: {
            content: [{ text: '$codiff', type: 'input_text' }],
            role: 'user',
            type: 'message',
          },
          type: 'response_item',
        }),
      ].join('\n'),
    );
    process.env.CODEX_HOME = directory;

    await expect(readCodexSessionContext(sessionId)).resolves.toMatchObject({
      messages: [
        { role: 'user', text: 'Implement walkthrough session handoff.' },
        { role: 'assistant', text: 'Updated the CLI and skill handoff.' },
      ],
    });
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('finds the active Codex session under CODEX_HOME', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-codex-home-'));
  const previousCodexHome = process.env.CODEX_HOME;

  try {
    const sessionDirectory = join(directory, 'sessions', '2026', '05', '25');
    const sessionPath = join(sessionDirectory, `rollout-${sessionId}.jsonl`);
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(
      sessionPath,
      `${JSON.stringify({
        payload: {
          content: [
            {
              text: 'Keep Codiff in charge of the ephemeral walkthrough.',
              type: 'input_text',
            },
          ],
          role: 'user',
          type: 'message',
        },
        type: 'response_item',
      })}\n`,
    );
    process.env.CODEX_HOME = directory;

    await expect(readCodexSessionContext(sessionId)).resolves.toMatchObject({
      messages: [
        {
          role: 'user',
          text: 'Keep Codiff in charge of the ephemeral walkthrough.',
        },
      ],
      source: {
        threadId: sessionId,
        type: 'codex-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('searches newer Codex session directories first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-codex-session-order-'));
  const olderDirectory = join(directory, 'sessions', '2025', '12', '31');
  const newerDirectory = join(directory, 'sessions', '2026', '01', '01');
  const olderPath = join(olderDirectory, `rollout-${sessionId}.jsonl`);
  const newerPath = join(newerDirectory, `rollout-${sessionId}.jsonl`);
  const previousCodexHome = process.env.CODEX_HOME;

  try {
    await mkdir(olderDirectory, { recursive: true });
    await mkdir(newerDirectory, { recursive: true });
    await writeFile(
      olderPath,
      `${JSON.stringify({
        payload: {
          content: [{ text: 'Older message.', type: 'input_text' }],
          role: 'user',
          type: 'message',
        },
        type: 'response_item',
      })}\n`,
    );
    await writeFile(
      newerPath,
      `${JSON.stringify({
        payload: {
          content: [{ text: 'Newer message.', type: 'input_text' }],
          role: 'user',
          type: 'message',
        },
        type: 'response_item',
      })}\n`,
    );
    process.env.CODEX_HOME = directory;

    await expect(readCodexSessionContext(sessionId)).resolves.toMatchObject({
      messages: [{ role: 'user', text: 'Newer message.' }],
    });
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('reads recent Codex messages from a large session without loading the whole file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-codex-large-session-'));
  const sessionDirectory = join(directory, 'sessions', '2026', '05', '25');
  const sessionPath = join(sessionDirectory, `rollout-${sessionId}.jsonl`);
  const previousCodexHome = process.env.CODEX_HOME;

  try {
    await mkdir(sessionDirectory, { recursive: true });
    const file = await open(sessionPath, 'w');
    try {
      await file.truncate(16 * 1024 * 1024 + 1);
      await file.write('\n', 0, 'utf8');
      await file.write(
        `${JSON.stringify({
          payload: {
            content: [{ text: 'Newest bounded Codex message.', type: 'input_text' }],
            role: 'user',
            type: 'message',
          },
          type: 'response_item',
        })}\n`,
        1,
        'utf8',
      );
    } finally {
      await file.close();
    }
    process.env.CODEX_HOME = directory;

    await expect(readCodexSessionContext(sessionId)).resolves.toMatchObject({
      messages: [{ role: 'user', text: 'Newest bounded Codex message.' }],
    });
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
