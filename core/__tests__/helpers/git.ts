import { rm } from 'node:fs/promises';

export const getGitTestEnvironment = (
  overrides: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_AUTHOR_EMAIL: 'codiff@example.com',
  GIT_AUTHOR_NAME: 'Codiff Test',
  GIT_COMMITTER_EMAIL: 'codiff@example.com',
  GIT_COMMITTER_NAME: 'Codiff Test',
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'core.excludesfile',
  GIT_CONFIG_KEY_1: 'commit.gpgSign',
  GIT_CONFIG_KEY_2: 'tag.gpgSign',
  GIT_CONFIG_VALUE_0: '/dev/null',
  GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_VALUE_2: 'false',
  ...overrides,
});

export const removeGitTestDirectory = (path: string) =>
  rm(path, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 50,
  });

export const withGitTestEnvironment = async <T>(
  callback: () => Promise<T>,
  overrides: Readonly<Record<string, string | undefined>> = {},
) => {
  const environment = getGitTestEnvironment(overrides);
  const keys = Object.keys(environment).filter(
    (key) =>
      key.startsWith('GIT_AUTHOR_') ||
      key.startsWith('GIT_COMMITTER_') ||
      key.startsWith('GIT_CONFIG_'),
  );
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    const value = environment[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};
