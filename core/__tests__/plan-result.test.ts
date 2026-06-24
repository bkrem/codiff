import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { waitForPlanResult } from '../../bin/plan-result.js';

test('plan result waiting only applies the timeout before the app opens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-result-'));
  const resultPath = join(directory, 'result.json');
  const child = new EventEmitter();

  try {
    await writeFile(resultPath, '{"pid":1234,"status":"open"}\n');
    const result = waitForPlanResult(resultPath, child, {
      isRunning: () => true,
      openTimeoutMs: 10,
      pollIntervalMs: 2,
    });
    setTimeout(() => {
      void writeFile(resultPath, '{"pid":1234,"status":"done"}\n');
    }, 30);

    await expect(result).resolves.toEqual({ pid: 1234, status: 'done' });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('plan result waiting fails when the app never opens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-result-'));
  const resultPath = join(directory, 'result.json');
  const child = new EventEmitter();

  try {
    await expect(
      waitForPlanResult(resultPath, child, {
        isRunning: () => true,
        openTimeoutMs: 10,
        pollIntervalMs: 2,
      }),
    ).rejects.toThrow('Codiff did not open the plan within 0.01 seconds.');
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('plan result waiting cancels when the opened app exits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-result-'));
  const resultPath = join(directory, 'result.json');
  const child = new EventEmitter();

  try {
    await writeFile(resultPath, '{"pid":1234,"status":"open"}\n');
    await expect(
      waitForPlanResult(resultPath, child, {
        isRunning: () => false,
        openTimeoutMs: 10,
        pollIntervalMs: 2,
      }),
    ).resolves.toEqual({ status: 'canceled' });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('plan result waiting returns the edited document identity and review packet', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-result-'));
  const resultPath = join(directory, 'result.json');
  const child = new EventEmitter();
  const result = {
    path: '/tmp/plan.md',
    pid: 1234,
    review: {
      document: {
        id: 'plan:/tmp/plan.md',
        path: '/tmp/plan.md',
        version: 'edited-version',
      },
      threads: [],
      version: 1,
    },
    status: 'done',
  };

  try {
    await writeFile(resultPath, `${JSON.stringify(result)}\n`);
    await expect(
      waitForPlanResult(resultPath, child, {
        isRunning: () => true,
        openTimeoutMs: 10,
        pollIntervalMs: 2,
      }),
    ).resolves.toEqual(result);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('plan result waiting returns a closed handoff with its review packet', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-result-'));
  const resultPath = join(directory, 'result.json');
  const child = new EventEmitter();
  const result = {
    documentChanged: true,
    path: '/tmp/plan.md',
    pid: 1234,
    review: {
      document: {
        id: 'plan:/tmp/plan.md',
        path: '/tmp/plan.md',
        version: 'edited-version',
      },
      threads: [],
      version: 1,
    },
    status: 'closed',
  };

  try {
    await writeFile(resultPath, `${JSON.stringify(result)}\n`);
    await expect(
      waitForPlanResult(resultPath, child, {
        isRunning: () => true,
        openTimeoutMs: 10,
        pollIntervalMs: 2,
      }),
    ).resolves.toEqual(result);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
