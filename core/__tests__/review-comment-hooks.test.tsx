/**
 * @vitest-environment jsdom
 */

import { act, useState } from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { useReviewCommentDrafts } from '../app/hooks/useReviewCommentDrafts.ts';
import type { ReviewComment } from '../lib/app-types.ts';
import { renderReact } from './helpers/react.tsx';

type ReviewCommentDrafts = ReturnType<typeof useReviewCommentDrafts> & {
  comments: ReadonlyArray<ReviewComment>;
};

const createComment = (id: string, overrides: Partial<ReviewComment> = {}): ReviewComment => ({
  body: '',
  filePath: 'src/app.ts',
  id,
  lineNumber: 1,
  sectionId: 'src/app.ts:unstaged',
  side: 'additions',
  ...overrides,
});

function ReviewCommentDraftsHarness({
  canCreateComment,
  initialComments = [],
  onCommentFileChange,
  onState,
}: {
  canCreateComment?: boolean;
  initialComments?: ReadonlyArray<ReviewComment>;
  onCommentFileChange: (filePath: string) => void;
  onState: (state: ReviewCommentDrafts) => void;
}) {
  const [comments, setComments] = useState(initialComments);
  const state = useReviewCommentDrafts({
    canCreateComment,
    comments,
    onCommentFileChange,
    setComments,
  });
  onState({ ...state, comments });
  return null;
}

const renderReviewCommentDrafts = async ({
  canCreateComment,
  initialComments,
}: {
  canCreateComment?: boolean;
  initialComments?: ReadonlyArray<ReviewComment>;
} = {}) => {
  const onCommentFileChange = vi.fn();
  const stateRef: { current: ReviewCommentDrafts | null } = { current: null };
  const view = await renderReact(
    <ReviewCommentDraftsHarness
      canCreateComment={canCreateComment}
      initialComments={initialComments}
      onCommentFileChange={onCommentFileChange}
      onState={(state) => (stateRef.current = state)}
    />,
  );
  const getState = () => {
    if (!stateRef.current) {
      throw new Error('Review comment drafts did not render.');
    }
    return stateRef.current;
  };
  return { getState, onCommentFileChange, view };
};

test('review comment drafts create, update, focus, and delete local comments', async () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000001');
  const { getState, onCommentFileChange, view } = await renderReviewCommentDrafts();

  try {
    const comment = createComment('ignored');
    const { body: _body, id: _id, ...location } = comment;
    await act(async () => {
      getState().createComment(location);
    });

    expect(getState().comments).toEqual([
      {
        ...location,
        body: '',
        id: '00000000-0000-4000-8000-000000000001',
      },
    ]);
    expect(getState().focusCommentId).toBe('00000000-0000-4000-8000-000000000001');
    expect(getState().focusCommentRequest).toBe(1);
    expect(onCommentFileChange).toHaveBeenLastCalledWith('src/app.ts');

    await act(async () => {
      getState().updateComment('00000000-0000-4000-8000-000000000001', 'Review this');
      getState().updateActiveReviewCommentDraft({
        body: 'Review this',
        id: '00000000-0000-4000-8000-000000000001',
      });
    });
    expect(getState().comments[0]?.body).toBe('Review this');
    expect(getState().activeReviewCommentDraftState).toEqual({
      body: 'pending',
      id: '00000000-0000-4000-8000-000000000001',
    });

    await act(async () => {
      getState().deleteComment('00000000-0000-4000-8000-000000000001');
    });
    expect(getState().comments).toEqual([]);
    expect(getState().focusCommentId).toBeNull();
    expect(getState().activeReviewCommentDraftRef.current).toBeNull();
  } finally {
    randomUUID.mockRestore();
    await view.cleanup();
  }
});

test('review comment drafts focus an existing empty comment at the same location', async () => {
  const existing = createComment('existing');
  const { getState, onCommentFileChange, view } = await renderReviewCommentDrafts({
    initialComments: [existing],
  });

  try {
    const { body: _body, id: _id, ...location } = existing;
    await act(async () => {
      getState().createComment(location);
    });

    expect(getState().comments).toEqual([existing]);
    expect(getState().focusCommentId).toBe('existing');
    expect(getState().focusCommentRequest).toBe(1);
    expect(onCommentFileChange).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

test('review comment drafts preserve active text when reusing another empty draft', async () => {
  const active = createComment('active');
  const reusable = createComment('reusable', {
    filePath: 'src/old.ts',
    sectionId: 'src/old.ts:unstaged',
  });
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000002');
  const { getState, onCommentFileChange, view } = await renderReviewCommentDrafts({
    initialComments: [active, reusable],
  });

  try {
    await act(async () => {
      getState().updateActiveReviewCommentDraft({
        body: 'Unflushed editor text',
        id: active.id,
      });
    });
    const next = createComment('ignored', {
      filePath: 'src/new.ts',
      sectionId: 'src/new.ts:unstaged',
    });
    const { body: _body, id: _id, ...location } = next;
    await act(async () => {
      getState().createComment(location);
    });

    expect(getState().comments[0]).toEqual(active);
    expect(getState().comments[1]).toEqual({
      ...location,
      body: '',
      id: '00000000-0000-4000-8000-000000000002',
    });
    expect(onCommentFileChange).toHaveBeenNthCalledWith(1, 'src/old.ts');
    expect(onCommentFileChange).toHaveBeenNthCalledWith(2, 'src/new.ts');
  } finally {
    randomUUID.mockRestore();
    await view.cleanup();
  }
});

test('review comment drafts can disable comment creation', async () => {
  const { getState, onCommentFileChange, view } = await renderReviewCommentDrafts({
    canCreateComment: false,
  });

  try {
    const comment = createComment('ignored');
    const { body: _body, id: _id, ...location } = comment;
    await act(async () => {
      getState().createComment(location);
    });

    expect(getState().comments).toEqual([]);
    expect(getState().focusCommentRequest).toBe(0);
    expect(onCommentFileChange).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});
