import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import type { PlanReview } from '../../core/types.ts';

const require = createRequire(import.meta.url);
const { getPlanReviewPath, normalizePlanReview, readPlanReview, writePlanReview } =
  require('../plan-review.cjs') as {
    getPlanReviewPath: (userDataPath: string, planFile: string) => string;
    normalizePlanReview: (value: unknown) => PlanReview;
    readPlanReview: (userDataPath: string, planFile: string) => Promise<PlanReview | null>;
    writePlanReview: (
      userDataPath: string,
      planFile: string,
      review: unknown,
    ) => Promise<PlanReview>;
  };

const createReview = (body: string): PlanReview => {
  const author = {
    email: 'reviewer@example.com',
    id: 'reviewer@example.com',
    name: 'Reviewer',
  };
  return {
    document: {
      id: 'plan:/tmp/plan.md',
      path: '/tmp/plan.md',
      version: 'plan-version',
    },
    threads: [
      {
        anchor: {
          block: {
            fingerprint: 'heading-fingerprint',
            path: [0],
            text: 'Execute the plan',
            type: 'heading',
          },
          kind: 'block',
          version: 1,
        },
        createdAt: '2026-06-24T00:00:00.000Z',
        createdBy: author,
        id: 'thread-1',
        messages: [
          {
            author,
            body,
            createdAt: '2026-06-24T00:00:00.000Z',
            id: 'message-1',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
        ],
        status: 'open',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    ],
    version: 1,
  };
};

test('plan reviews round trip through the sidecar store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-review-'));
  const planFile = join(directory, 'plan.md');
  const review = createReview('Keep this requirement explicit.');

  try {
    await expect(readPlanReview(directory, planFile)).resolves.toBeNull();
    await expect(writePlanReview(directory, planFile, review)).resolves.toEqual(review);
    await expect(readPlanReview(directory, planFile)).resolves.toEqual(review);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('queued plan review writes preserve invocation order and leave no temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-review-'));
  const planFile = join(directory, 'plan.md');
  const reviews = ['First', 'Second', 'Final'].map(createReview);

  try {
    await Promise.all(reviews.map((review) => writePlanReview(directory, planFile, review)));
    await expect(readPlanReview(directory, planFile)).resolves.toEqual(reviews.at(-1));

    const reviewPath = getPlanReviewPath(directory, planFile);
    expect(await readdir(dirname(reviewPath))).toEqual([reviewPath.split('/').at(-1)]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('invalid plan review schemas are rejected on write and read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-plan-review-'));
  const planFile = join(directory, 'plan.md');
  const invalidReview = {
    ...createReview('Invalid'),
    threads: [{ id: 'missing-required-fields' }],
  };

  try {
    expect(() => normalizePlanReview(invalidReview)).toThrow('Invalid plan review.');
    await expect(writePlanReview(directory, planFile, invalidReview)).rejects.toThrow(
      'Invalid plan review.',
    );

    const reviewPath = getPlanReviewPath(directory, planFile);
    await mkdir(dirname(reviewPath), { recursive: true });
    await writeFile(reviewPath, `${JSON.stringify(invalidReview)}\n`);
    await expect(readPlanReview(directory, planFile)).rejects.toThrow('Invalid plan review.');
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
