import { useCallback, useState } from 'react';
import type { ReviewIdentity } from '../../lib/app-types.ts';
import { isGeneratedWalkthroughFile } from '../../lib/narrative-walkthrough-diff.js';
import {
  getFileReviewIdentity,
  updateReviewIdentityCollapsed,
  updateReviewIdentityViewed,
} from '../../lib/review-identity.ts';
import type { ChangedFile } from '../../types.ts';

type UseReviewFileStateOptions = {
  initialSelectedPath?: string | null;
  onViewedChange?: (viewed: Record<string, string>) => void;
};

export function useReviewFileState({
  initialSelectedPath = null,
  onViewedChange,
}: UseReviewFileStateOptions = {}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expandedGenerated, setExpandedGenerated] = useState<Set<string>>(() => new Set());
  const [itemVersionByKey, setItemVersionByKey] = useState<Record<string, number>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(initialSelectedPath);
  const [viewed, setViewed] = useState<Record<string, string>>({});

  const bumpItemVersion = useCallback((key: string) => {
    setItemVersionByKey((current) => ({
      ...current,
      [key]: (current[key] ?? 0) + 1,
    }));
  }, []);

  const toggleCollapsed = useCallback(
    (file: ChangedFile, isCollapsed: boolean, reviewKey = file.path) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (isCollapsed) {
          next.delete(reviewKey);
        } else {
          next.add(reviewKey);
        }
        return next;
      });
      setExpandedGenerated((current) => {
        const next = new Set(current);
        if (isCollapsed && isGeneratedWalkthroughFile(file)) {
          next.add(reviewKey);
        } else {
          next.delete(reviewKey);
        }
        return next;
      });
      bumpItemVersion(reviewKey);
    },
    [bumpItemVersion],
  );

  const toggleViewed = useCallback(
    (
      file: ChangedFile,
      isViewed: boolean,
      reviewIdentity: ReviewIdentity = getFileReviewIdentity(file),
    ) => {
      setViewed((current) => {
        const next = updateReviewIdentityViewed(current, reviewIdentity, isViewed);
        onViewedChange?.(next);
        return next;
      });
      setCollapsed((current) => updateReviewIdentityCollapsed(current, reviewIdentity, isViewed));
      if (!isViewed) {
        setExpandedGenerated((current) => {
          const next = new Set(current);
          next.delete(reviewIdentity.key);
          return next;
        });
      }
      bumpItemVersion(reviewIdentity.key);
    },
    [bumpItemVersion, onViewedChange],
  );

  return {
    bumpItemVersion,
    collapsed,
    expandedGenerated,
    itemVersionByKey,
    selectedPath,
    setCollapsed,
    setExpandedGenerated,
    setItemVersionByKey,
    setSelectedPath,
    setViewed,
    toggleCollapsed,
    toggleViewed,
    viewed,
  };
}
