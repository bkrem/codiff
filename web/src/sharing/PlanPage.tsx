import type { PlanCommentThread, SharedPlanSnapshot } from '@nkzw/codiff-core';
import { parsePlanShareManifest } from '@nkzw/codiff-core/share';
import { SharedPlanApp, type SharedPlanCommenting } from '@nkzw/codiff-service/react';
import type { Plan } from '@nkzw/codiff-service/views';
import { use } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { type ViewRef, useFateClient, useLiveView, useRequest, view } from 'react-fate';
import { auth } from 'void/client/react';
import {
  ShareComments,
  ShareCommentMessageView,
  ShareCommentThreadConnectionView,
  ShareCommentThreadView,
  type ShareCommentMessageValue,
  type ShareCommentThreadValue,
} from './ShareComments.tsx';
import {
  errorMessage,
  sessionUsername,
  signInWithGitHub,
  toISOString,
  usePageTitle,
} from './utils.ts';
import ViewerError from './ViewerError.tsx';

const PlanPageView = view<Plan>()({
  canDelete: true,
  canResolveComments: true,
  commentThreads: ShareCommentThreadConnectionView,
  id: true,
  slug: true,
});

const manifests = new Map<string, Promise<SharedPlanSnapshot>>();
const getManifest = (slug: string) => {
  let request = manifests.get(slug);
  if (!request) {
    request = fetch(`/api/plans/${encodeURIComponent(slug)}/manifest`, {
      signal: AbortSignal.timeout(10_000),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to load plan (${response.status}).`);
      }
      return parsePlanShareManifest(await response.json());
    });
    manifests.set(slug, request);
  }
  return request;
};

const toMessage = (message: ShareCommentMessageValue) => ({
  author: {
    ...(message.authorImage ? { avatarUrl: message.authorImage } : {}),
    id: message.authorUsername ?? message.id,
    name: message.authorName,
    ...(message.authorUsername ? { username: message.authorUsername } : {}),
  },
  body: message.body,
  ...(message.canEdit ? { canDelete: true, canEdit: true } : {}),
  createdAt: toISOString(message.createdAt),
  id: message.id,
  updatedAt: toISOString(message.updatedAt),
});

const toThread = (
  thread: ShareCommentThreadValue,
  signedIn: boolean,
  canResolve: boolean,
): PlanCommentThread | null => {
  if (thread.kind !== 'plan' || !thread.anchorJson || thread.messages.length === 0) {
    return null;
  }
  const messages = thread.messages.map(toMessage);
  try {
    return {
      anchor: JSON.parse(thread.anchorJson) as PlanCommentThread['anchor'],
      ...(signedIn ? { canReply: true } : {}),
      ...(canResolve ? { canResolve: true } : {}),
      createdAt: toISOString(thread.createdAt),
      createdBy: messages[0]!.author,
      id: thread.id,
      messages,
      ...(thread.status === 'resolved' && thread.resolvedAt
        ? {
            resolution: {
              reason: 'agent-handled' as const,
              resolvedAt: toISOString(thread.resolvedAt),
            },
          }
        : {}),
      status: thread.status,
      updatedAt: toISOString(thread.updatedAt),
    };
  } catch {
    return null;
  }
};

const Viewer = ({ plan: planRef }: { plan: ViewRef<'Plan'> }) => {
  const fate = useFateClient();
  const plan = useLiveView(PlanPageView, planRef);
  const snapshot = use(getManifest(plan.slug));
  usePageTitle(snapshot.document.title);
  const { data: session } = auth.useSession();
  const username = sessionUsername(session?.user);
  const deleteShare = plan.canDelete
    ? async () => {
        const response = await fate.mutations.plan.delete({
          input: { id: plan.id },
          view: PlanPageView,
        });
        if (response.error) {
          throw new Error(errorMessage(response.error));
        }
        manifests.delete(plan.slug);
        window.location.replace('/');
      }
    : undefined;
  const commenting: SharedPlanCommenting = {
    canComment: Boolean(session?.user.id),
    identity: session?.user
      ? {
          email: session.user.email,
          ...(session.user.image ? { gravatarUrl: session.user.image } : {}),
          name: session.user.name,
          ...(username ? { username } : {}),
        }
      : null,
    onCreateThread: async (anchor, body) => {
      const now = new Date();
      const threadId = `optimistic:${crypto.randomUUID()}`;
      const response = await fate.mutations.shareComment.createThread({
        input: { body, shareId: plan.id, shareType: 'plan', target: { anchor, kind: 'plan' } },
        optimistic: {
          anchorJson: JSON.stringify(anchor),
          createdAt: now,
          filePath: null,
          id: threadId,
          kind: 'plan',
          lineNumber: null,
          messages: [
            {
              authorImage: session?.user.image ?? null,
              authorName: session?.user.name ?? 'You',
              authorUsername: username,
              body,
              canEdit: true,
              createdAt: now,
              id: `optimistic:${crypto.randomUUID()}`,
              threadId,
              updatedAt: now,
            },
          ],
          planId: plan.id,
          resolvedAt: null,
          side: null,
          startLineNumber: null,
          startSide: null,
          status: 'open',
          updatedAt: now,
          walkthroughId: null,
        },
        view: ShareCommentThreadView,
      });
      if (response.error) {
        throw new Error(errorMessage(response.error));
      }
    },
    onDeleteMessage: async (id) => {
      const response = await fate.mutations.shareComment.deleteMessage({
        delete: true,
        input: { id },
        view: ShareCommentMessageView,
      });
      if (response.error) {
        throw new Error(errorMessage(response.error));
      }
    },
    onReply: async (threadId, body) => {
      const now = new Date();
      const response = await fate.mutations.shareComment.reply({
        input: { body, threadId },
        optimistic: {
          authorImage: session?.user.image ?? null,
          authorName: session?.user.name ?? 'You',
          authorUsername: username,
          body,
          canEdit: true,
          createdAt: now,
          id: `optimistic:${crypto.randomUUID()}`,
          threadId,
          updatedAt: now,
        },
        view: ShareCommentMessageView,
      });
      if (response.error) {
        throw new Error(errorMessage(response.error));
      }
    },
    onResolve: async (threadId, resolved) => {
      const response = await fate.mutations.shareComment.resolveThread({
        input: { resolved, threadId },
        optimistic: {
          id: threadId,
          resolvedAt: resolved ? new Date() : null,
          status: resolved ? 'resolved' : 'open',
          updatedAt: new Date(),
        },
        view: ShareCommentThreadView,
      });
      if (response.error) {
        throw new Error(errorMessage(response.error));
      }
    },
    onSignIn: signInWithGitHub,
    onUpdateMessage: async (messageId, body) => {
      const response = await fate.mutations.shareComment.updateMessage({
        input: { body, messageId },
        optimistic: { body, id: messageId, updatedAt: new Date() },
        view: ShareCommentMessageView,
      });
      if (response.error) {
        throw new Error(errorMessage(response.error));
      }
    },
  };

  return (
    <ShareComments connection={plan.commentThreads}>
      {(threads) => (
        <SharedPlanApp
          commenting={commenting}
          onDeleteShare={deleteShare}
          providerLabel="GitHub"
          snapshot={{
            ...snapshot,
            review: {
              ...snapshot.review,
              threads: threads.flatMap((thread) => {
                const converted = toThread(
                  thread,
                  Boolean(session?.user.id),
                  plan.canResolveComments,
                );
                return converted ? [converted] : [];
              }),
            },
          }}
        />
      )}
    </ShareComments>
  );
};

const Screen = ({ slug }: { slug: string }) => {
  const { planBySlug } = useRequest({
    planBySlug: { args: { slug }, view: PlanPageView },
  });
  return planBySlug ? (
    <Viewer plan={planBySlug} />
  ) : (
    <ViewerError detail={new Error('Unable to load plan (404).')} title="Shared plan unavailable" />
  );
};

export default function PlanPage({ slug }: { slug: string }) {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => <ViewerError detail={error} title="Shared plan unavailable" />}
      onError={() => manifests.delete(slug)}
      resetKeys={[slug]}
    >
      <Screen slug={slug} />
    </ErrorBoundary>
  );
}
