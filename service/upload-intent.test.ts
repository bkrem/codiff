import { expect, test } from 'vite-plus/test';
import {
  createUploadIntentSecret,
  hashUploadIntentSecret,
  verifyUploadIntentSecret,
} from './upload-intent.ts';

const env = { BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters' };

test('creates upload intent capabilities bound to their code and expiration', async () => {
  const expiresAt = new Date('2026-07-16T12:00:00.000Z');
  const secret = await createUploadIntentSecret(env, 'UPLOADCODE', expiresAt);

  expect(await verifyUploadIntentSecret(env, 'UPLOADCODE', secret)).toEqual({ expiresAt });
  expect(await verifyUploadIntentSecret(env, 'OTHER-CODE', secret)).toBeNull();
  expect(await verifyUploadIntentSecret(env, 'UPLOADCODE', `${secret}tampered`)).toBeNull();
  expect(await hashUploadIntentSecret(secret)).toMatch(/^[a-f0-9]{64}$/);
});

test('requires a configured signing secret', async () => {
  await expect(
    createUploadIntentSecret({}, 'UPLOADCODE', new Date('2026-07-16T12:00:00.000Z')),
  ).rejects.toThrow('BETTER_AUTH_SECRET');
});
