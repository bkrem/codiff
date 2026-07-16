// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

const useRequest = vi.hoisted(() => vi.fn());

vi.mock('void/client/react', () => ({ auth }));
vi.mock('react-fate', () => ({
  useFateClient: vi.fn(),
  useLiveView: vi.fn(),
  useRequest,
  view: () => (definition: unknown) => definition,
}));

import ConnectPage from './ConnectPage.tsx';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, '', '/connect/share-code?secret=upload-secret');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  auth.useSession.mockReset().mockReturnValue({
    data: { user: { id: 'github-user' } },
    isPending: false,
  });
  useRequest.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

test('uses the shared Thinking state while the GitHub session loads', async () => {
  auth.useSession.mockReturnValue({ data: null, isPending: true });

  await act(async () => root.render(<ConnectPage code="share-code" />));

  const loading = container.querySelector('[role="status"]');
  expect(loading?.textContent).toBe('Thinking…');
  expect(loading?.className).toBe('review-source-loading loading pulse italic');
});

test('reports authenticated upload failures as server errors instead of sign-in failures', async () => {
  useRequest.mockImplementation(() => {
    throw new Error('fate: transport does not support live views.');
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  await act(async () => root.render(<ConnectPage code="share-code" />));

  expect(container.textContent).toContain('Unable to authorize upload');
  expect(container.textContent).toContain('fate: transport does not support live views.');
  expect(container.textContent).not.toContain('Upload authorization required');
  expect(container.querySelector('button')).toBeNull();
});
