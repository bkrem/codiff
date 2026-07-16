import { createSharingFateServer } from '@nkzw/codiff-service/fate';
import { live } from './live.ts';

export const fateServer = createSharingFateServer({
  live,
  providerLabel: 'GitHub',
});

export {
  SharingRoot as Root,
  type Plan,
  type ShareCommentMessage,
  type ShareCommentThread,
  type ShareStats,
  type ShareStatsDay,
  type UploadIntent,
  type Walkthrough,
} from '@nkzw/codiff-service/views';
