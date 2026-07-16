// @vitest-environment jsdom

import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const fate = vi.hoisted(() => ({
  client: {
    mutations: {
      plan: { delete: vi.fn() },
      shareComment: {
        createThread: vi.fn(),
        deleteMessage: vi.fn(),
        reply: vi.fn(),
        resolveThread: vi.fn(),
        updateMessage: vi.fn(),
      },
    },
  },
  useFateClient: vi.fn(),
  useLiveView: vi.fn(),
  useRequest: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  signIn: { social: vi.fn() },
  useSession: vi.fn(),
}));
const rendered = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
}));

vi.mock('@nkzw/codiff-service/react', () => ({
  SharedPlanApp: (props: Record<string, unknown>) => {
    rendered.props = props;
    return <div>Plan</div>;
  },
}));
vi.mock('react-fate', () => ({
  useFateClient: fate.useFateClient,
  useLiveView: fate.useLiveView,
  useRequest: fate.useRequest,
  view: () => (selection: unknown) => selection,
}));
vi.mock('void/client/react', () => ({ auth }));
vi.mock('./ShareComments.tsx', () => ({
  ShareCommentMessageView: {},
  ShareComments: ({ children }: { children: (threads: []) => unknown }) => children([]),
  ShareCommentThreadConnectionView: { items: { node: {} } },
  ShareCommentThreadView: {},
}));

import PlanPage from './PlanPage.tsx';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  rendered.props = null;
  fate.useFateClient.mockReset().mockReturnValue(fate.client);
  fate.useRequest.mockReset().mockReturnValue({
    planBySlug: { __typename: 'Plan', id: 'plan-id' },
  });
  fate.useLiveView.mockReset().mockReturnValue({
    canDelete: false,
    canResolveComments: true,
    commentThreads: {},
    id: 'plan-id',
    slug: 'optimistic-plan',
  });
  for (const mutation of Object.values(fate.client.mutations.shareComment)) {
    mutation.mockReset().mockResolvedValue({ error: null });
  }
  auth.useSession.mockReset().mockReturnValue({
    data: {
      user: {
        displayUsername: 'ada',
        email: 'ada@example.com',
        id: 'user-id',
        image: 'https://example.com/ada.png',
        name: 'Ada Lovelace',
      },
    },
    isPending: false,
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      codiffVersion: '1.8.0',
      document: { content: '# Plan\n', name: 'plan.md', title: 'Plan' },
      exportedAt: '2026-07-16T00:00:00.000Z',
      kind: 'codiff-plan-share',
      preferences: { theme: 'system' },
      review: { threads: [], version: 1 },
      version: 1,
    }),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

test('optimistically adds plan replies to the existing thread', async () => {
  await act(async () => {
    root.render(
      <Suspense fallback={null}>
        <PlanPage slug="optimistic-plan" />
      </Suspense>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const commenting = rendered.props?.commenting as {
    onReply(threadId: string, body: string): Promise<void>;
  };
  await commenting.onReply('thread-id', 'An immediate reply.');

  expect(fate.client.mutations.shareComment.reply).toHaveBeenCalledWith({
    input: { body: 'An immediate reply.', threadId: 'thread-id' },
    optimistic: {
      authorImage: 'https://example.com/ada.png',
      authorName: 'Ada Lovelace',
      authorUsername: 'ada',
      body: 'An immediate reply.',
      canEdit: true,
      createdAt: expect.any(Date),
      id: expect.stringMatching(/^optimistic:/),
      threadId: 'thread-id',
      updatedAt: expect.any(Date),
    },
    view: {},
  });
});
