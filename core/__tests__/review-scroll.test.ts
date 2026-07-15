import { expect, test, vi } from 'vite-plus/test';
import { getSelectedPathFromScroll } from '../lib/review-scroll.ts';
import { createChangedFile } from './helpers/fixtures.ts';

const firstFile = createChangedFile('src/first.ts');
const secondFile = createChangedFile('src/second.ts');
const thirdFile = createChangedFile('src/third.ts');
const files = [firstFile, secondFile, thirdFile];

const createViewer = (scrollTop: number, itemTops: Readonly<Record<string, number>>) => ({
  getScrollTop: () => scrollTop,
  getTopForItem: (itemId: string) => itemTops[itemId],
});

test('selected path from scroll returns null without visible files', () => {
  const viewer = createViewer(0, {});

  expect(getSelectedPathFromScroll(viewer, [], false)).toBeNull();
});

test('selected path from scroll uses the closest file above the activation point', () => {
  const viewer = createViewer(210, {
    'diff:src/first.ts:unstaged': 20,
    'diff:src/second.ts:unstaged': 220,
    'diff:src/third.ts:unstaged': 420,
  });

  expect(getSelectedPathFromScroll(viewer, files, false)).toBe(secondFile.path);
});

test('selected path from scroll falls back to the first file before measured content', () => {
  const viewer = createViewer(0, {
    'diff:src/first.ts:unstaged': 20,
    'diff:src/second.ts:unstaged': 220,
  });

  expect(getSelectedPathFromScroll(viewer, files, false)).toBe(firstFile.path);
});

test('selected path from scroll ignores files without measured positions', () => {
  const getTopForItem = vi.fn((itemId: string) =>
    itemId === 'diff:src/third.ts:unstaged' ? 400 : undefined,
  );
  const viewer = {
    getScrollTop: () => 500,
    getTopForItem,
  };

  expect(getSelectedPathFromScroll(viewer, files, false)).toBe(thirdFile.path);
  expect(getTopForItem).toHaveBeenCalledTimes(3);
});
