import { useEffect } from 'react';
import { auth } from 'void/client/react';

export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : String(error);

export const sessionUsername = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const user = value as { displayUsername?: unknown; username?: unknown };
  return typeof user.displayUsername === 'string'
    ? user.displayUsername
    : typeof user.username === 'string'
      ? user.username
      : null;
};

export const toISOString = (value: Date | string) =>
  typeof value === 'string' ? value : value.toISOString();

export const signInWithGitHub = async () => {
  await auth.signIn.social({
    callbackURL: window.location.pathname + window.location.search + window.location.hash,
    errorCallbackURL: window.location.pathname + window.location.search + window.location.hash,
    provider: 'github',
  });
};

export const usePageTitle = (title?: string) => {
  useEffect(() => {
    document.title = title?.trim() ? `${title} · Codiff` : 'Codiff';
  }, [title]);
};
