import { expect, test } from 'vite-plus/test';
import { handleSharingApiRequest, type SharingEnv } from './api.ts';

test('creates anonymous upload intents without touching persistent storage', async () => {
  let databaseAccesses = 0;
  const failOnDatabaseAccess = () => {
    databaseAccesses += 1;
    throw new Error('Anonymous intent creation must not access D1.');
  };
  const env = {
    BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    DB: {
      batch: failOnDatabaseAccess,
      prepare: failOnDatabaseAccess,
    } as unknown as SharingEnv['DB'],
    PUBLIC_ORIGIN: 'https://codiff.dev',
    WALKTHROUGH_BUCKET: {
      delete: async () => {
        throw new Error('Anonymous intent creation must not access R2.');
      },
      get: async () => {
        throw new Error('Anonymous intent creation must not access R2.');
      },
      put: async () => {
        throw new Error('Anonymous intent creation must not access R2.');
      },
    },
  } satisfies SharingEnv;

  const response = await handleSharingApiRequest(
    new Request('https://codiff.dev/api/upload-intents', { method: 'POST' }),
    env,
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    claimUrl: expect.stringMatching(/^https:\/\/codiff\.dev\/connect\/.+\?secret=.+/),
    code: expect.any(String),
    pollUrl: expect.stringMatching(/^https:\/\/codiff\.dev\/api\/upload-intents\/.+\?secret=.+/),
    secret: expect.any(String),
    status: 'pending',
  });
  expect(databaseAccesses).toBe(0);
});
