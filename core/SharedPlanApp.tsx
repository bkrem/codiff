import {
  MarkdownEditor,
  type MarkdownAnnotation,
  type MarkdownAnnotationLayout,
  type MarkdownCommentTarget,
  type MarkdownEditorHandle,
} from '@nkzw/mdx-editor';
import { frontmatterPlugin, imagePlugin } from '@nkzw/mdx-editor/core';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/DownloadSimple';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Avatar } from './app/components/Avatar.tsx';
import { ReadOnlyMarkdownView } from './app/components/ReadOnlyMarkdownView.tsx';
import type {
  GitIdentity,
  PlanCommentAuthor,
  PlanCommentMessage,
  PlanCommentThread,
  SharedPlanSnapshot,
} from './types.ts';

const markdownPlugins = [
  frontmatterPlugin(),
  imagePlugin({
    disableImageResize: true,
    disableImageSettingsButton: true,
  }),
];

const planCommentColorCount = 8;
const pendingPlanCommentId = 'pending-plan-comment';

export const getPlanCommentColorIndex = (username: string) => {
  const value = username.trim().toLowerCase();
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % planCommentColorCount;
};

const normalizeIdentityValue = (value?: string) => value?.trim().toLowerCase() || null;

const getStrongIdentityValues = (identity: { email?: string; username?: string }) =>
  new Set([identity.username, identity.email].map(normalizeIdentityValue).filter(Boolean));

const matchesPlanCommentIdentity = (author: PlanCommentAuthor, identity: GitIdentity) => {
  const authorValues = getStrongIdentityValues(author);
  const identityValues = getStrongIdentityValues(identity);
  if (authorValues.size > 0 && identityValues.size > 0) {
    return [...authorValues].some((value) => identityValues.has(value));
  }
  return normalizeIdentityValue(author.name) === normalizeIdentityValue(identity.name);
};

export const getPlanCommentIdentityColorIndex = (
  identity: GitIdentity | null,
  threads: ReadonlyArray<PlanCommentThread>,
) => {
  if (!identity) {
    return null;
  }
  const existingAuthor = threads
    .flatMap((thread) => [thread.createdBy, ...thread.messages.map(({ author }) => author)])
    .find((author) => matchesPlanCommentIdentity(author, identity));
  return getPlanCommentColorIndex(
    existingAuthor?.username ??
      existingAuthor?.email ??
      identity.username ??
      identity.email ??
      identity.name,
  );
};

export const getPlanCommentAffordancePosition = ({
  contentPaddingRight,
  contentRight,
  target,
  workspaceLeft,
  workspaceTop,
}: {
  contentPaddingRight: number;
  contentRight: number;
  target: MarkdownCommentTarget;
  workspaceLeft: number;
  workspaceTop: number;
}) => ({
  left: contentRight - workspaceLeft - contentPaddingRight,
  target,
  top:
    target.rect.top -
    workspaceTop +
    (target.anchor.kind === 'text' ? Math.max(0, (target.rect.height - 24) / 2) : 0),
  width: contentPaddingRight + 24,
});

export type SharedPlanCommenting = {
  canComment: boolean;
  identity: GitIdentity | null;
  onCreateThread: (anchor: MarkdownCommentTarget['anchor'], body: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReply: (threadId: string, body: string) => Promise<void>;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  onSignIn: () => Promise<void> | void;
  onUpdateMessage: (messageId: string, body: string) => Promise<void>;
};

const planCommentEntityLabels: Readonly<Record<string, string>> = {
  codeblock: 'Code block',
  frontmatter: 'Frontmatter',
  heading: 'Heading',
  horizontalrule: 'Divider',
  image: 'Image',
  listitem: 'List item',
  paragraph: 'Paragraph',
  quote: 'Quote',
  table: 'Table',
};

const getPlanCommentTargetLabel = (anchor: MarkdownCommentTarget['anchor']) => {
  const entity =
    anchor.kind === 'text' ? 'Selection' : (planCommentEntityLabels[anchor.block.type] ?? 'Block');
  const targetText = (anchor.kind === 'text' ? anchor.quote?.exact : anchor.block.text)
    ?.replaceAll(/\s+/g, ' ')
    .trim();
  if (!targetText) {
    return entity;
  }
  const maximumLength = 48;
  const excerpt =
    targetText.length > maximumLength
      ? `${targetText.slice(0, maximumLength - 1).trimEnd()}…`
      : targetText;
  return `${entity} · ${excerpt}`;
};

const escapeInlineMarkdown = (value: string) =>
  value.replaceAll('\\', String.raw`\\`).replaceAll(/([`*_[\]<>])/g, String.raw`\$1`);

const getPlanCommentAuthorLabel = (author: PlanCommentAuthor) => {
  const name = author.name.trim();
  const username = author.username?.trim();
  const identity = username ? `@${username}` : author.email?.trim();
  if (name && identity && normalizeIdentityValue(name) !== normalizeIdentityValue(identity)) {
    return `${name} (${identity})`;
  }
  return name || identity || 'Unknown author';
};

export const getSharedPlanDownloadContent = (snapshot: SharedPlanSnapshot) => {
  if (snapshot.review.threads.length === 0) {
    return snapshot.document.content;
  }

  const comments = snapshot.review.threads.map((thread, index) => {
    const messages = thread.messages.map((message) => {
      const body = message.body.trim() ? message.body : '_No comment text._';
      return `**${escapeInlineMarkdown(getPlanCommentAuthorLabel(message.author))}** · ${message.createdAt}\n\n${body}`;
    });
    return [
      `### Comment ${index + 1}: ${escapeInlineMarkdown(getPlanCommentTargetLabel(thread.anchor))}`,
      `_Status: ${thread.status === 'resolved' ? 'Resolved' : 'Open'}_`,
      ...messages,
    ].join('\n\n');
  });
  const content = snapshot.document.content;
  const separator = content
    ? content.endsWith('\n\n')
      ? ''
      : content.endsWith('\n')
        ? '\n'
        : '\n\n'
    : '';
  return `${content}${separator}---\n\n## Comments\n\n${comments.join('\n\n---\n\n')}\n`;
};

function CommentComposer({
  ariaLabel,
  identity,
  onCancel,
  onReveal,
  onSubmit,
  submitLabel,
  target,
}: {
  ariaLabel: string;
  identity: GitIdentity | null;
  onCancel: () => void;
  onReveal: () => void;
  onSubmit: (body: string) => Promise<void>;
  submitLabel: string;
  target: MarkdownCommentTarget['anchor'];
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = useCallback(() => {
    const value = body.trim();
    if (!value || submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    void onSubmit(value)
      .then(() => {
        setBody('');
        onCancel();
      })
      .catch((submitError: unknown) => {
        setError(submitError instanceof Error ? submitError.message : String(submitError));
      })
      .finally(() => setSubmitting(false));
  }, [body, onCancel, onSubmit, submitting]);
  const displayName = identity?.name || identity?.email || 'You';
  const targetLabel = getPlanCommentTargetLabel(target);

  return (
    <form
      className="review-comment-thread plan-comment-thread plan-comment-composer active"
      onKeyDown={(event: ReactKeyboardEvent<HTMLFormElement>) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="review-comment">
        <Avatar fallback={displayName} size="medium" url={identity?.gravatarUrl} />
        <div className="review-comment-body">
          <div className="review-comment-header plan-comment-header">
            <div className="plan-comment-heading">
              <strong>{displayName}</strong>
              <button
                aria-label={`Show comment target: ${targetLabel}`}
                className="plan-comment-target"
                onClick={onReveal}
                title={`Show ${targetLabel}`}
                type="button"
              >
                {targetLabel}
              </button>
            </div>
          </div>
          <textarea
            aria-label={ariaLabel}
            autoFocus
            className="review-comment-input plan-comment-input"
            disabled={submitting}
            onChange={(event) => setBody(event.currentTarget.value)}
            placeholder="Write a comment…"
            rows={4}
            value={body}
          />
        </div>
      </div>
      <div className="review-comment-thread-footer">
        {error ? <div className="review-comment-thread-error">{error}</div> : null}
        <div className="review-comment-thread-actions">
          <button
            className="review-comment-action"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="review-comment-action"
            disabled={!body.trim() || submitting}
            type="submit"
          >
            {submitting ? 'Sending' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function SharedPlanMessage({
  commenting,
  message,
  onEditingChange,
  target,
}: {
  commenting?: SharedPlanCommenting;
  message: PlanCommentMessage;
  onEditingChange: (messageId: string, editing: boolean) => void;
  target?: {
    label: string;
    onReveal: () => void;
    resolvedLabel?: string;
    unavailable: boolean;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!editing) {
      return;
    }
    const input = editInputRef.current;
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);
  const displayName = message.author.name;
  const save = useCallback(() => {
    const body = draft.trim();
    if (!commenting || !body || submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    void commenting
      .onUpdateMessage(message.id, body)
      .then(() => {
        onEditingChange(message.id, false);
        setEditing(false);
      })
      .catch((saveError: unknown) => {
        setError(saveError instanceof Error ? saveError.message : String(saveError));
      })
      .finally(() => setSubmitting(false));
  }, [commenting, draft, message.id, onEditingChange, submitting]);

  return (
    <div className={`review-comment plan-comment-message${editing ? ' editing' : ''}`}>
      <Avatar fallback={displayName} size="medium" url={message.author.avatarUrl} />
      <div className="review-comment-body">
        <div
          className={`review-comment-header plan-comment-header${
            message.canEdit || message.canDelete || editing ? ' with-comment-action' : ''
          }`}
        >
          <div className="plan-comment-heading">
            <strong>{displayName}</strong>
            {message.updatedAt !== message.createdAt ? <span>edited</span> : null}
            {target?.resolvedLabel ? (
              <span className="plan-comment-status">{target.resolvedLabel}</span>
            ) : null}
            {target ? (
              <button
                aria-label={`Show comment target: ${target.label}`}
                className="plan-comment-target"
                disabled={target.unavailable}
                onClick={target.onReveal}
                title={
                  target.unavailable
                    ? `Comment target unavailable: ${target.label}`
                    : `Show ${target.label}`
                }
                type="button"
              >
                {target.label}
              </button>
            ) : null}
          </div>
          {editing ? (
            <span className="general-comment-edit-actions">
              <button
                className="review-comment-action"
                disabled={submitting}
                onClick={() => {
                  setDraft(message.body);
                  onEditingChange(message.id, false);
                  setEditing(false);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="review-comment-action"
                disabled={!draft.trim() || submitting}
                onClick={save}
                type="button"
              >
                {submitting ? 'Saving' : 'Save'}
              </button>
            </span>
          ) : (
            <>
              {message.canEdit ? (
                <button
                  className="review-comment-action"
                  data-plan-edit-button=""
                  onClick={() => {
                    setDraft(message.body);
                    onEditingChange(message.id, true);
                    setEditing(true);
                  }}
                  type="button"
                >
                  Edit
                </button>
              ) : null}
              {message.canDelete ? (
                <button
                  aria-label="Delete comment"
                  className="review-comment-delete"
                  onClick={() => {
                    void commenting?.onDeleteMessage(message.id).catch((deleteError: unknown) => {
                      window.alert(
                        deleteError instanceof Error ? deleteError.message : String(deleteError),
                      );
                    });
                  }}
                  title="Delete comment"
                  type="button"
                >
                  <X aria-hidden className="review-comment-delete-icon" size={14} />
                </button>
              ) : null}
            </>
          )}
        </div>
        {editing ? (
          <textarea
            aria-label={`Edit comment by ${displayName}`}
            className="review-comment-input plan-comment-input"
            disabled={submitting}
            onChange={(event) => setDraft(event.currentTarget.value)}
            ref={editInputRef}
            rows={4}
            value={draft}
          />
        ) : (
          <ReadOnlyMarkdownView
            ariaLabel={`Comment by ${displayName}`}
            className="review-comment-markdown-editor"
            contentClassName="review-comment-input read-only"
            fallback={<div className="review-comment-input read-only" />}
            value={message.body}
            variant="embedded"
          />
        )}
        {error ? <div className="review-comment-error">{error}</div> : null}
      </div>
    </div>
  );
}

function SharedPlanThread({
  active,
  commenting,
  detached,
  onActivate,
  onCancelReply,
  onHeightChange,
  onReveal,
  thread,
}: {
  active: boolean;
  commenting?: SharedPlanCommenting;
  detached: boolean;
  onActivate: () => void;
  onCancelReply: () => void;
  onHeightChange: () => void;
  onReveal: () => void;
  thread: PlanCommentThread;
}) {
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [editingMessageIds, setEditingMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  const handleEditingChange = useCallback((messageId: string, editing: boolean) => {
    setEditingMessageIds((current) => {
      const next = new Set(current);
      if (editing) {
        next.add(messageId);
      } else {
        next.delete(messageId);
      }
      return next;
    });
  }, []);
  const resolved = thread.status === 'resolved';
  const resolvedLabel =
    thread.resolution?.reason === 'anchor-removed' ? 'Resolved after target removal' : 'Resolved';
  const targetLabel = getPlanCommentTargetLabel(thread.anchor);
  return (
    <div
      className={`review-comment-thread plan-comment-thread${
        active && !replying && editingMessageIds.size === 0 ? ' active' : ''
      }${detached ? ' detached' : ''}${resolved ? ' resolved' : ''}`}
      onFocusCapture={(event) => {
        if (
          !(event.target as HTMLElement).closest(
            '[data-plan-edit-button], [data-plan-reply-button]',
          )
        ) {
          onActivate();
        }
      }}
      onPointerDown={(event) => {
        if (
          !(event.target as HTMLElement).closest(
            '[data-plan-edit-button], [data-plan-reply-button]',
          )
        ) {
          onActivate();
        }
      }}
    >
      {thread.messages.map((message, index) => (
        <SharedPlanMessage
          commenting={commenting}
          key={message.id}
          message={message}
          onEditingChange={handleEditingChange}
          target={
            index === 0
              ? {
                  label: targetLabel,
                  onReveal,
                  resolvedLabel: resolved ? resolvedLabel : undefined,
                  unavailable: detached || resolved,
                }
              : undefined
          }
        />
      ))}
      {replying ? (
        <CommentComposer
          ariaLabel="Write a reply"
          identity={commenting?.identity ?? null}
          onCancel={() => {
            setReplying(false);
            onCancelReply();
            onHeightChange();
          }}
          onReveal={onReveal}
          onSubmit={(body) => commenting!.onReply(thread.id, body)}
          submitLabel="Reply"
          target={thread.anchor}
        />
      ) : null}
      <div className="review-comment-thread-footer">
        <div className="review-comment-thread-actions">
          {thread.canReply && commenting?.canComment && !resolved && !replying ? (
            <button
              className="review-comment-action"
              data-plan-reply-button=""
              onClick={() => {
                setReplying(true);
                onHeightChange();
              }}
              type="button"
            >
              Reply
            </button>
          ) : null}
          {thread.canResolve ? (
            <button
              className="review-comment-action"
              disabled={resolving}
              onClick={() => {
                setResolving(true);
                void commenting
                  ?.onResolve(thread.id, !resolved)
                  .catch((error: unknown) => {
                    window.alert(error instanceof Error ? error.message : String(error));
                  })
                  .finally(() => setResolving(false));
              }}
              type="button"
            >
              {resolving ? 'Saving' : resolved ? 'Reopen' : 'Resolve'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SharedPlanCommentRail({
  activeThreadId,
  commenting,
  layoutPass,
  layouts,
  onActivate,
  onCancelPending,
  onCancelReply,
  onHeightChange,
  onReveal,
  onRevealPending,
  pendingTarget,
  threads,
  workspace,
}: {
  activeThreadId: string | null;
  commenting?: SharedPlanCommenting;
  layoutPass: number;
  layouts: ReadonlyArray<MarkdownAnnotationLayout>;
  onActivate: (thread: PlanCommentThread) => void;
  onCancelPending: () => void;
  onCancelReply: (thread: PlanCommentThread) => void;
  onHeightChange: () => void;
  onReveal: (thread: PlanCommentThread) => void;
  onRevealPending: () => void;
  pendingTarget: MarkdownCommentTarget | null;
  threads: ReadonlyArray<PlanCommentThread>;
  workspace: HTMLElement | null;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const resolvedRef = useRef<HTMLDetailsElement>(null);
  const signInRef = useRef<HTMLDivElement>(null);
  const layoutById = useMemo(
    () => new Map(layouts.map((layout) => [layout.id, layout])),
    [layouts],
  );
  const openThreads = useMemo(
    () =>
      threads
        .filter((thread) => thread.status === 'open')
        .sort((left, right) => {
          const leftTop = layoutById.get(left.id)?.rect?.top ?? Number.POSITIVE_INFINITY;
          const rightTop = layoutById.get(right.id)?.rect?.top ?? Number.POSITIVE_INFINITY;
          return leftTop - rightTop || left.createdAt.localeCompare(right.createdAt);
        }),
    [layoutById, threads],
  );
  const resolvedThreads = useMemo(
    () =>
      threads
        .filter((thread) => thread.status === 'resolved')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [threads],
  );

  useLayoutEffect(() => {
    if (!workspace) {
      return;
    }
    const workspaceTop = workspace.getBoundingClientRect().top;
    const positionedComments = openThreads.flatMap((thread) => {
      const element = cardRefs.current.get(thread.id);
      if (!element) {
        return [];
      }
      return [
        {
          element,
          top: layoutById.get(thread.id)?.rect?.top ?? Number.POSITIVE_INFINITY,
        },
      ];
    });
    if (pendingRef.current && pendingTarget) {
      positionedComments.push({
        element: pendingRef.current,
        top: layoutById.get(pendingPlanCommentId)?.rect?.top ?? pendingTarget.rect.top,
      });
    }
    positionedComments.sort((left, right) => left.top - right.top);
    let bottom = 12;
    for (const { element, top: targetTop } of positionedComments) {
      const top = Math.max(Number.isFinite(targetTop) ? targetTop - workspaceTop : bottom, bottom);
      element.style.top = `${top}px`;
      bottom = top + (element.getBoundingClientRect().height || 110) + 8;
    }
    if (signInRef.current) {
      signInRef.current.style.top = `${bottom}px`;
      bottom += (signInRef.current.getBoundingClientRect().height || 48) + 8;
    }
    asideRef.current?.style.setProperty('--plan-comment-resolved-top', `${bottom}px`);
    const resolvedHeight = resolvedRef.current?.getBoundingClientRect().height ?? 0;
    asideRef.current?.style.setProperty(
      '--plan-comment-rail-min-height',
      `${bottom + resolvedHeight + 12}px`,
    );
  }, [layoutById, layoutPass, openThreads, pendingTarget, resolvedThreads.length, workspace]);

  useEffect(() => {
    const rail = railRef.current;
    const card = activeThreadId ? cardRefs.current.get(activeThreadId) : null;
    if (!rail || !card || window.getComputedStyle(rail).overflowY !== 'auto') {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const railRect = rail.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const inset = 8;
      let top = rail.scrollTop;
      if (cardRect.top < railRect.top + inset) {
        top += cardRect.top - railRect.top - inset;
      } else if (cardRect.bottom > railRect.bottom - inset) {
        top += cardRect.bottom - railRect.bottom + inset;
      } else {
        return;
      }
      rail.scrollTo({ behavior: 'smooth', top: Math.max(0, top) });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeThreadId]);

  return (
    <aside className="plan-comment-rail" ref={asideRef}>
      <div className="plan-comment-rail-scroll" ref={railRef}>
        {openThreads.map((thread) => (
          <div
            className="plan-comment-position"
            key={thread.id}
            ref={(element) => {
              if (element) {
                cardRefs.current.set(thread.id, element);
              } else {
                cardRefs.current.delete(thread.id);
              }
            }}
          >
            <SharedPlanThread
              active={activeThreadId === thread.id}
              commenting={commenting}
              detached={!layoutById.has(thread.id)}
              onActivate={() => onActivate(thread)}
              onCancelReply={() => onCancelReply(thread)}
              onHeightChange={onHeightChange}
              onReveal={() => onReveal(thread)}
              thread={thread}
            />
          </div>
        ))}
        {pendingTarget && commenting?.canComment ? (
          <div className="plan-comment-position pending" ref={pendingRef}>
            <CommentComposer
              ariaLabel="Write a plan comment"
              identity={commenting.identity}
              onCancel={onCancelPending}
              onReveal={onRevealPending}
              onSubmit={(body) => commenting.onCreateThread(pendingTarget.anchor, body)}
              submitLabel="Comment"
              target={pendingTarget.anchor}
            />
          </div>
        ) : null}
        {resolvedThreads.length > 0 ? (
          <details className="plan-resolved-comments" onToggle={onHeightChange} ref={resolvedRef}>
            <summary>Resolved comments ({resolvedThreads.length})</summary>
            <div className="plan-resolved-comment-list">
              {resolvedThreads.map((thread) => (
                <SharedPlanThread
                  active={activeThreadId === thread.id}
                  commenting={commenting}
                  detached
                  key={thread.id}
                  onActivate={() => onActivate(thread)}
                  onCancelReply={() => onCancelReply(thread)}
                  onHeightChange={onHeightChange}
                  onReveal={() => onReveal(thread)}
                  thread={thread}
                />
              ))}
            </div>
          </details>
        ) : null}
        {commenting && !commenting.canComment ? (
          <div className="plan-comment-position general-comment-sign-in" ref={signInRef}>
            <button
              className="codiff-open-button"
              onClick={() => commenting?.onSignIn()}
              type="button"
            >
              Sign in with GitLab to comment
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function SharedPlanApp({
  commenting,
  snapshot,
}: {
  commenting?: SharedPlanCommenting;
  snapshot: SharedPlanSnapshot;
}) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<{
    left: number;
    target: MarkdownCommentTarget;
    top: number;
    width: number;
  } | null>(null);
  const [layoutPass, setLayoutPass] = useState(0);
  const [layouts, setLayouts] = useState<ReadonlyArray<MarkdownAnnotationLayout>>([]);
  const [pendingTarget, setPendingTarget] = useState<MarkdownCommentTarget | null>(null);
  const [workspace, setWorkspace] = useState<HTMLDivElement | null>(null);
  const commentingIdentity = commenting?.identity ?? null;
  const commentingColorIndex = getPlanCommentIdentityColorIndex(
    commentingIdentity,
    snapshot.review.threads,
  );
  const annotationColorById = useMemo(() => {
    const colors = new Map(
      snapshot.review.threads.map((thread) => [
        thread.id,
        commentingIdentity &&
        commentingColorIndex !== null &&
        matchesPlanCommentIdentity(thread.createdBy, commentingIdentity)
          ? commentingColorIndex
          : getPlanCommentColorIndex(
              thread.createdBy.username ??
                thread.createdBy.email ??
                thread.createdBy.name ??
                thread.createdBy.id,
            ),
      ]),
    );
    if (pendingTarget && commentingColorIndex !== null) {
      colors.set(pendingPlanCommentId, commentingColorIndex);
    }
    return colors;
  }, [commentingColorIndex, commentingIdentity, pendingTarget, snapshot.review.threads]);
  const annotations = useMemo<ReadonlyArray<MarkdownAnnotation>>(
    () => [
      ...snapshot.review.threads
        .filter((thread) => thread.status === 'open')
        .map(({ anchor, id }) => ({ anchor, id })),
      ...(pendingTarget ? [{ anchor: pendingTarget.anchor, id: pendingPlanCommentId }] : []),
    ],
    [pendingTarget, snapshot.review.threads],
  );

  useLayoutEffect(() => {
    if (!workspace) {
      return;
    }
    const elements = workspace.querySelectorAll<HTMLElement>(
      '[data-mdx-annotation-ids], [data-mdx-annotation-block]',
    );
    for (const element of elements) {
      const ids = (element.dataset.mdxAnnotationIds ?? element.dataset.mdxAnnotationBlock ?? '')
        .split(' ')
        .filter(Boolean);
      const threadId =
        activeThreadId && ids.includes(activeThreadId)
          ? activeThreadId
          : ids.find((id) => annotationColorById.has(id));
      const colorIndex = threadId ? annotationColorById.get(threadId) : undefined;
      if (colorIndex === undefined) {
        element.removeAttribute('data-plan-comment-color');
        element.style.removeProperty('--mdx-editor-annotation-active-bg');
        element.style.removeProperty('--mdx-editor-annotation-bg');
        continue;
      }
      element.dataset.planCommentColor = String(colorIndex);
      element.style.setProperty(
        '--mdx-editor-annotation-active-bg',
        `var(--plan-comment-highlight-${colorIndex}-active)`,
      );
      element.style.setProperty(
        '--mdx-editor-annotation-bg',
        `var(--plan-comment-highlight-${colorIndex})`,
      );
    }
  }, [activeThreadId, annotationColorById, layouts, workspace]);

  useLayoutEffect(() => {
    const editor = workspace?.querySelector<HTMLElement>('.codiff-plan-editor');
    if (!editor) {
      return;
    }
    if (commentingColorIndex === null) {
      editor.style.removeProperty('--plan-comment-selection');
    } else {
      editor.style.setProperty(
        '--plan-comment-selection',
        `var(--plan-comment-highlight-${commentingColorIndex}-active)`,
      );
    }
  }, [commentingColorIndex, workspace]);

  useEffect(() => {
    const root = document.documentElement;
    if (snapshot.preferences.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', snapshot.preferences.theme);
    }
  }, [snapshot.preferences.theme]);

  const revealThread = useCallback((thread: PlanCommentThread) => {
    setActiveThreadId(thread.id);
    editorRef.current?.focusAnnotation(thread.id);
  }, []);
  const cancelPendingComment = useCallback(() => {
    editorRef.current?.removeAnnotation(pendingPlanCommentId);
    setPendingTarget(null);
    setActiveThreadId((active) => (active === pendingPlanCommentId ? null : active));
  }, []);
  const handleCommentTargetChange = useCallback(
    (target: MarkdownCommentTarget | null) => {
      if (!target) {
        setCommentTarget(null);
        return;
      }
      if (!workspace) {
        return;
      }
      const workspaceRect = workspace.getBoundingClientRect();
      const contentElement = workspace.querySelector<HTMLElement>('.mdx-editor-content');
      const contentRect = contentElement?.getBoundingClientRect();
      const contentPaddingRight = contentElement
        ? Number.parseFloat(window.getComputedStyle(contentElement).paddingRight) || 0
        : 0;
      const contentRight = contentRect?.right ?? target.rect.left + target.rect.width;
      setCommentTarget(
        getPlanCommentAffordancePosition({
          contentPaddingRight,
          contentRight,
          target,
          workspaceLeft: workspaceRect.left,
          workspaceTop: workspaceRect.top,
        }),
      );
    },
    [workspace],
  );
  const hasCommentRail =
    snapshot.review.threads.length > 0 ||
    Boolean(pendingTarget) ||
    Boolean(commenting && !commenting.canComment);
  const downloadPlan = useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([getSharedPlanDownloadContent(snapshot)], {
        type: 'text/markdown;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.download = snapshot.document.name.trim() || 'plan.md';
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [snapshot]);

  return (
    <main className="plan-shell shared-plan-shell">
      <header className="plan-header">
        <div className="plan-title" title={snapshot.document.title}>
          {snapshot.document.title}
        </div>
      </header>
      <section className="plan-review review">
        <div
          className={`plan-workspace${hasCommentRail ? ' with-comments' : ''}`}
          onClickCapture={(event) => {
            const element = event.target as HTMLElement;
            const ids =
              element.closest<HTMLElement>('[data-mdx-annotation-ids]')?.dataset.mdxAnnotationIds ??
              element.closest<HTMLElement>('[data-mdx-annotation-block]')?.dataset
                .mdxAnnotationBlock;
            const id = ids?.split(' ')[0];
            if (id) {
              setActiveThreadId(id);
            }
          }}
          ref={setWorkspace}
        >
          <div className="plan-document code-view">
            <div className="plan-file-surface">
              <div className="codiff-file-header plan-file-header">
                <div className="codiff-header-toggle codiff-header-toggle-static">
                  <span className="codiff-file-heading">
                    <span className="codiff-file-path-row">
                      <span className="codiff-file-path">{snapshot.document.name}</span>
                    </span>
                  </span>
                </div>
                <button
                  aria-label="Download plan"
                  className="codiff-open-button plan-download-button"
                  onClick={downloadPlan}
                  title="Download plan"
                  type="button"
                >
                  <DownloadSimple aria-hidden size={16} weight="bold" />
                </button>
              </div>
              <MarkdownEditor
                activeAnnotationId={pendingTarget ? pendingPlanCommentId : activeThreadId}
                additionalPlugins={markdownPlugins}
                annotations={annotations}
                ariaLabel={`Read ${snapshot.document.title}`}
                className="codiff-plan-editor"
                colorScheme="inherit"
                density="document"
                onAnnotationLayoutChange={setLayouts}
                onCommentTargetChange={commenting ? handleCommentTargetChange : undefined}
                readOnly
                ref={editorRef}
                spellCheck={false}
                suppressHtmlProcessing
                value={snapshot.document.content}
                variant="plain"
              />
            </div>
          </div>
          {hasCommentRail ? (
            <SharedPlanCommentRail
              activeThreadId={activeThreadId}
              commenting={commenting}
              layoutPass={layoutPass}
              layouts={layouts}
              onActivate={(thread) => setActiveThreadId(thread.id)}
              onCancelPending={cancelPendingComment}
              onCancelReply={(thread) =>
                setActiveThreadId((active) => (active === thread.id ? null : active))
              }
              onHeightChange={() => setLayoutPass((pass) => pass + 1)}
              onReveal={revealThread}
              onRevealPending={() => editorRef.current?.focusAnnotation(pendingPlanCommentId)}
              pendingTarget={pendingTarget}
              threads={snapshot.review.threads}
              workspace={workspace}
            />
          ) : null}
          {commenting && commentTarget ? (
            <div
              className="plan-comment-affordance"
              data-mdx-comment-button=""
              onPointerLeave={(event) => {
                if (
                  !(event.relatedTarget as HTMLElement | null)?.closest?.(
                    '[data-mdx-comment-block], .mdx-editor-content',
                  )
                ) {
                  handleCommentTargetChange(null);
                }
              }}
              style={
                {
                  '--plan-comment-left': `${commentTarget.left}px`,
                  '--plan-comment-top': `${commentTarget.top}px`,
                  '--plan-comment-width': `${commentTarget.width}px`,
                } as CSSProperties
              }
            >
              <button
                aria-label={`Comment on ${commentTarget.target.label.toLowerCase()}`}
                className="plan-comment-add"
                onClick={() => {
                  if (commenting?.canComment) {
                    setPendingTarget(commentTarget.target);
                    setActiveThreadId(pendingPlanCommentId);
                  } else {
                    void commenting?.onSignIn();
                  }
                  handleCommentTargetChange(null);
                }}
                onPointerDown={(event) => event.preventDefault()}
                title={`Comment on ${commentTarget.target.label.toLowerCase()}`}
                type="button"
              >
                +
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
