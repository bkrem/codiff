import type {
  GitIdentity,
  PullRequestExistingReviewComment,
  PullRequestReviewComment,
  SharedWalkthroughSnapshot,
} from '@nkzw/codiff-core';
import {
  PlanReviewSurface,
  ReviewSurface,
  type PlanReviewCommenting,
  type ReviewCommenting,
} from '@nkzw/codiff-core/react';
import type { ComponentProps, ReactNode } from 'react';

export type SharedPlanCommenting = PlanReviewCommenting;
export type SharedWalkthroughCommenting = ReviewCommenting;

type SubmittedShareCommentMessage = {
  authorImage: null | string;
  authorName: string;
  authorUsername: null | string;
  body: string;
  canEdit: boolean;
  createdAt: string;
  id: string;
  threadId: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const submittedShareCommentMessage = (value: unknown): SubmittedShareCommentMessage => {
  const message = asRecord(value);
  if (
    !message ||
    typeof message.authorName !== 'string' ||
    typeof message.body !== 'string' ||
    typeof message.canEdit !== 'boolean' ||
    typeof message.createdAt !== 'string' ||
    typeof message.id !== 'string' ||
    typeof message.threadId !== 'string'
  ) {
    throw new Error('Unable to load the submitted walkthrough comment.');
  }
  return {
    authorImage: typeof message.authorImage === 'string' ? message.authorImage : null,
    authorName: message.authorName,
    authorUsername: typeof message.authorUsername === 'string' ? message.authorUsername : null,
    body: message.body,
    canEdit: message.canEdit,
    createdAt: message.createdAt,
    id: message.id,
    threadId: message.threadId,
  };
};

const toSubmittedReviewComment = (
  comment: PullRequestReviewComment,
  message: SubmittedShareCommentMessage,
  threadId: string,
  canResolveThread: boolean,
): PullRequestExistingReviewComment => ({
  ...comment,
  author: {
    ...(message.authorImage ? { avatarUrl: message.authorImage } : {}),
    login: message.authorUsername ?? message.authorName,
    name: message.authorName,
  },
  body: message.body,
  ...(message.canEdit ? { canDelete: true, canEdit: true } : {}),
  ...(canResolveThread ? { canResolveThread: true } : {}),
  id: message.id,
  submittedAt: message.createdAt,
  threadId,
});

export const resolveSubmittedShareReply = ({
  canResolveThread,
  comment,
  result,
}: {
  canResolveThread: boolean;
  comment: PullRequestReviewComment & { threadId: string };
  result: unknown;
}) =>
  toSubmittedReviewComment(
    comment,
    submittedShareCommentMessage(result),
    comment.threadId,
    canResolveThread,
  );

export const resolveSubmittedShareThread = ({
  canResolveThread,
  comment,
  result,
}: {
  canResolveThread: boolean;
  comment: PullRequestReviewComment;
  result: unknown;
}) => {
  const thread = asRecord(result);
  const messages = thread ? asRecord(thread.messages) : null;
  const firstItem = messages && Array.isArray(messages.items) ? asRecord(messages.items[0]) : null;
  if (!thread || typeof thread.id !== 'string' || !firstItem) {
    throw new Error('Unable to load the submitted walkthrough comment.');
  }
  return toSubmittedReviewComment(
    comment,
    submittedShareCommentMessage(firstItem.node),
    thread.id,
    canResolveThread,
  );
};

export function SharedPlanApp({
  providerLabel,
  ...props
}: Omit<ComponentProps<typeof PlanReviewSurface>, 'signInLabel'> & {
  providerLabel: string;
}) {
  return <PlanReviewSurface {...props} signInLabel={`Sign in with ${providerLabel} to comment`} />;
}

export function SharedWalkthroughApp({
  commenting,
  gitIdentity,
  onDeleteShare,
  providerLabel,
  settingsBar,
  snapshot,
}: {
  commenting?: SharedWalkthroughCommenting;
  gitIdentity?: GitIdentity | null;
  onDeleteShare?: () => Promise<void> | void;
  providerLabel: string;
  settingsBar?: ReactNode;
  snapshot: SharedWalkthroughSnapshot;
}) {
  return (
    <ReviewSurface
      commenting={commenting}
      gitIdentity={gitIdentity}
      onDeleteShare={onDeleteShare}
      providerLabel={providerLabel}
      settingsBar={settingsBar}
      signInLabel={`Sign in with ${providerLabel} to comment`}
      snapshot={snapshot}
    />
  );
}
