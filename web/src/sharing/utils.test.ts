import { expect, test } from 'vite-plus/test';
import { sessionUsername } from './utils.ts';

test('does not use account email as a public username', () => {
  expect(sessionUsername({ email: 'private@example.com' })).toBeNull();
  expect(
    sessionUsername({
      displayUsername: 'octocat',
      email: 'private@example.com',
      username: 'fallback',
    }),
  ).toBe('octocat');
});
