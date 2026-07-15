import type { ChangedFile } from '../types.ts';
import type { CodeViewInstance } from './app-types.ts';
import { DEFAULT_PADDING } from './code-view-options.ts';
import { getFirstVisibleSection, getItemId } from './diff.ts';

type ReviewScrollViewer = Pick<CodeViewInstance, 'getScrollTop' | 'getTopForItem'>;

export const getSelectedPathFromScroll = (
  viewer: ReviewScrollViewer,
  files: ReadonlyArray<ChangedFile>,
  showWhitespace: boolean,
) => {
  const firstFile = files[0];
  if (!firstFile) {
    return null;
  }

  const activationTop = viewer.getScrollTop() + DEFAULT_PADDING;
  let nextPath = firstFile.path;
  let nextDistance = Number.NEGATIVE_INFINITY;

  for (const file of files) {
    const section = getFirstVisibleSection(file, showWhitespace);
    const itemTop = section ? viewer.getTopForItem(getItemId(section)) : undefined;
    if (itemTop == null) {
      continue;
    }

    const distance = itemTop - activationTop;
    if (distance <= 0 && distance > nextDistance) {
      nextDistance = distance;
      nextPath = file.path;
    }
  }

  return nextPath;
};
