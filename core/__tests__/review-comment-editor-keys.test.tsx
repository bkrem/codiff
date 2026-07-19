/**
 * @vitest-environment jsdom
 */

import { act } from 'react';
import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { defaultKeymap } from '../config/defaults.ts';
import { getShortcutLabel } from '../config/keymap.ts';
import type { ReviewComment } from '../lib/app-types.ts';
import { createChangedFile } from './helpers/fixtures.ts';
import { renderReact } from './helpers/react.tsx';
import { resetCodeViewMock, ReviewCodeViewHarness } from './helpers/review-code-view.tsx';

vi.mock('@nkzw/mdx-editor', async () => {
  const React = await import('react');

  return {
    MarkdownEditor: React.forwardRef<
      { focus: () => void },
      {
        ariaLabel?: string;
        onChange?: (value: string) => void;
        onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
        value?: string;
      }
    >((props, ref) => {
      const inputRef = React.useRef<HTMLTextAreaElement>(null);
      React.useImperativeHandle(ref, () => ({
        focus: () => inputRef.current?.focus(),
      }));
      return (
        <textarea
          aria-label={props.ariaLabel}
          onChange={(event) => props.onChange?.(event.currentTarget.value)}
          onKeyDown={(event) =>
            props.onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLDivElement>)
          }
          ref={inputRef}
          value={props.value}
        />
      );
    }),
  };
});

beforeEach(() => {
  resetCodeViewMock();
});

const isMac = navigator.platform.toLowerCase().includes('mac');
const askAgentKey = { ctrlKey: !isMac, key: 'Enter', metaKey: isMac, shiftKey: true };
const submitCommentKey = { ctrlKey: !isMac, key: 'Enter', metaKey: isMac };

const dispatchKeyDown = async (target: Element, init: KeyboardEventInit) => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
  });
};

const file = createChangedFile('src/hotkeys.ts');
const comment = {
  body: 'Please take a look at this.',
  filePath: file.path,
  id: 'comment-1',
  lineNumber: 1,
  sectionId: file.sections[0].id,
  side: 'additions',
} satisfies ReviewComment;

const renderEditor = async (overrides: {
  comments?: ReadonlyArray<ReviewComment>;
  onAskCodex: (commentId: string) => void;
  onSubmitComment?: (commentId: string) => void;
  supportsReviewCommentActions?: boolean;
}) => renderReact(<ReviewCodeViewHarness comments={[comment]} files={[file]} {...overrides} />);

test('askAgent shortcut asks the agent in pull request mode', async () => {
  const onAskCodex = vi.fn();
  const onSubmitComment = vi.fn();
  const view = await renderEditor({
    onAskCodex,
    onSubmitComment,
    supportsReviewCommentActions: true,
  });

  try {
    await dispatchKeyDown(view.container.querySelector('textarea')!, askAgentKey);
    expect(onAskCodex).toHaveBeenCalledWith(comment.id);
    expect(onSubmitComment).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

test('askAgent shortcut asks the agent in local diff mode', async () => {
  const onAskCodex = vi.fn();
  const view = await renderEditor({ onAskCodex });

  try {
    await dispatchKeyDown(view.container.querySelector('textarea')!, askAgentKey);
    expect(onAskCodex).toHaveBeenCalledWith(comment.id);
  } finally {
    await view.cleanup();
  }
});

test('submitComment shortcut submits in pull request mode and still asks in local diff mode', async () => {
  const onAskCodex = vi.fn();
  const onSubmitComment = vi.fn();
  const pullRequestView = await renderEditor({
    onAskCodex,
    onSubmitComment,
    supportsReviewCommentActions: true,
  });

  try {
    await dispatchKeyDown(pullRequestView.container.querySelector('textarea')!, submitCommentKey);
    expect(onSubmitComment).toHaveBeenCalledWith(comment.id);
    expect(onAskCodex).not.toHaveBeenCalled();
  } finally {
    await pullRequestView.cleanup();
  }

  const localView = await renderEditor({ onAskCodex });
  try {
    await dispatchKeyDown(localView.container.querySelector('textarea')!, submitCommentKey);
    expect(onAskCodex).toHaveBeenCalledWith(comment.id);
  } finally {
    await localView.cleanup();
  }
});

test('comment shortcuts are inert while the draft is empty', async () => {
  const onAskCodex = vi.fn();
  const onSubmitComment = vi.fn();
  const view = await renderEditor({
    comments: [{ ...comment, body: '   ' }],
    onAskCodex,
    onSubmitComment,
    supportsReviewCommentActions: true,
  });

  try {
    const textarea = view.container.querySelector('textarea')!;
    await dispatchKeyDown(textarea, askAgentKey);
    await dispatchKeyDown(textarea, submitCommentKey);
    expect(onAskCodex).not.toHaveBeenCalled();
    expect(onSubmitComment).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

test('Ask and Comment buttons advertise their shortcuts', async () => {
  const view = await renderEditor({
    onAskCodex: vi.fn(),
    onSubmitComment: vi.fn(),
    supportsReviewCommentActions: true,
  });

  try {
    const actions = [
      ...view.container.querySelectorAll<HTMLButtonElement>('.review-comment-action'),
    ];
    const askButton = actions.find((button) => button.textContent?.includes('Ask'));
    const commentButton = actions.find((button) => button.textContent?.includes('Comment'));
    expect(askButton?.title).toBe(`Ask Codex (${getShortcutLabel(defaultKeymap, 'askAgent')})`);
    expect(commentButton?.title).toBe(
      `Submit review comment (${getShortcutLabel(defaultKeymap, 'submitComment')})`,
    );
  } finally {
    await view.cleanup();
  }
});
