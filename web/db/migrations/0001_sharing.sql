CREATE TABLE `user` (
  `banExpires` integer,
  `banned` integer,
  `banReason` text,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `displayUsername` text,
  `email` text NOT NULL,
  `emailVerified` integer DEFAULT false NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `image` text,
  `name` text NOT NULL,
  `password` text,
  `role` text DEFAULT 'user' NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `username` text
);
CREATE UNIQUE INDEX `user_email_key` ON `user` (`email`);
CREATE UNIQUE INDEX `user_username_key` ON `user` (`username`);
CREATE INDEX `user_id_idx` ON `user` (`id`);

CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expiresAt` integer NOT NULL,
  `token` text NOT NULL,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  `ipAddress` text,
  `userAgent` text,
  `userId` text NOT NULL,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade
);
CREATE UNIQUE INDEX `session_token_uidx` ON `session` (`token`);
CREATE INDEX `session_userId_idx` ON `session` (`userId`);

CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `providerId` text NOT NULL,
  `userId` text NOT NULL,
  `accessToken` text,
  `refreshToken` text,
  `idToken` text,
  `accessTokenExpiresAt` integer,
  `refreshTokenExpiresAt` integer,
  `scope` text,
  `password` text,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade
);
CREATE INDEX `account_userId_idx` ON `account` (`userId`);

CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expiresAt` integer NOT NULL,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL
);
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);

CREATE TABLE `UploadIntent` (
  `claimedAt` integer,
  `code` text NOT NULL,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `expiresAt` integer NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `secretHash` text NOT NULL,
  `sharedByUserId` text REFERENCES `user`(`id`) ON DELETE set null,
  `shareKind` text DEFAULT 'walkthrough' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `uploadTokenHash` text,
  `walkthroughSlug` text
);
CREATE UNIQUE INDEX `UploadIntent_code_key` ON `UploadIntent` (`code`);
CREATE INDEX `UploadIntent_sharedByUserId_idx` ON `UploadIntent` (`sharedByUserId`);

CREATE TABLE `Plan` (
  `agent` text,
  `byteSize` integer NOT NULL,
  `codiffVersion` text NOT NULL,
  `commentsImportedAt` integer,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `objectKey` text NOT NULL,
  `schemaVersion` integer NOT NULL,
  `sessionId` text,
  `sha256` text NOT NULL,
  `sharedByEmail` text,
  `sharedByName` text,
  `sharedByUserId` text REFERENCES `user`(`id`) ON DELETE set null,
  `slug` text NOT NULL,
  `sourceFileName` text NOT NULL,
  `title` text NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
CREATE UNIQUE INDEX `Plan_slug_key` ON `Plan` (`slug`);
CREATE INDEX `Plan_sharedByEmail_idx` ON `Plan` (`sharedByEmail`);
CREATE INDEX `Plan_sharedByUserId_idx` ON `Plan` (`sharedByUserId`);

CREATE TABLE `Walkthrough` (
  `branch` text,
  `byteSize` integer NOT NULL,
  `codiffVersion` text NOT NULL,
  `commentsImportedAt` integer,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `description` text,
  `filesIndexedAt` integer,
  `id` text PRIMARY KEY NOT NULL,
  `objectKey` text NOT NULL,
  `pullRequestNumber` integer,
  `pullRequestTitle` text,
  `pullRequestUrl` text,
  `repositoryHost` text,
  `repositoryName` text,
  `repositoryOwner` text,
  `repositoryUrl` text,
  `schemaVersion` integer NOT NULL,
  `sha256` text NOT NULL,
  `sharedByEmail` text,
  `sharedByName` text,
  `sharedByUserId` text REFERENCES `user`(`id`) ON DELETE set null,
  `slug` text NOT NULL,
  `sourceType` text NOT NULL,
  `title` text NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
CREATE UNIQUE INDEX `Walkthrough_slug_key` ON `Walkthrough` (`slug`);
CREATE INDEX `Walkthrough_sharedByEmail_idx` ON `Walkthrough` (`sharedByEmail`);
CREATE INDEX `Walkthrough_sharedByUserId_idx` ON `Walkthrough` (`sharedByUserId`);
CREATE INDEX `Walkthrough_repository_idx`
  ON `Walkthrough` (`repositoryOwner`, `repositoryName`);

CREATE TABLE `WalkthroughFile` (
  `path` text NOT NULL,
  `walkthroughId` text NOT NULL,
  PRIMARY KEY (`walkthroughId`, `path`),
  FOREIGN KEY (`walkthroughId`) REFERENCES `Walkthrough`(`id`) ON DELETE cascade
);

CREATE TABLE `ShareCommentThread` (
  `anchorJson` text,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `filePath` text,
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `lineNumber` integer,
  `planId` text REFERENCES `Plan`(`id`) ON DELETE cascade,
  `resolvedAt` integer,
  `side` text,
  `sourceThreadId` text,
  `startLineNumber` integer,
  `startSide` text,
  `status` text DEFAULT 'open' NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `walkthroughId` text REFERENCES `Walkthrough`(`id`) ON DELETE cascade,
  CONSTRAINT `ShareCommentThread_parent_check`
    CHECK (
      (`planId` IS NOT NULL AND `walkthroughId` IS NULL)
      OR (`planId` IS NULL AND `walkthroughId` IS NOT NULL)
    )
);
CREATE INDEX `ShareCommentThread_planId_createdAt_idx`
  ON `ShareCommentThread` (`planId`, `createdAt`);
CREATE INDEX `ShareCommentThread_walkthroughId_createdAt_idx`
  ON `ShareCommentThread` (`walkthroughId`, `createdAt`);
CREATE UNIQUE INDEX `ShareCommentThread_planId_sourceThreadId_key`
  ON `ShareCommentThread` (`planId`, `sourceThreadId`);
CREATE UNIQUE INDEX `ShareCommentThread_walkthroughId_sourceThreadId_key`
  ON `ShareCommentThread` (`walkthroughId`, `sourceThreadId`);

CREATE TABLE `ShareCommentMessage` (
  `authorImage` text,
  `authorName` text NOT NULL,
  `authorUserId` text REFERENCES `user`(`id`) ON DELETE set null,
  `authorUsername` text,
  `body` text NOT NULL,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `sourceMessageId` text,
  `threadId` text NOT NULL REFERENCES `ShareCommentThread`(`id`) ON DELETE cascade,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
CREATE INDEX `ShareCommentMessage_authorUserId_idx`
  ON `ShareCommentMessage` (`authorUserId`);
CREATE INDEX `ShareCommentMessage_threadId_createdAt_idx`
  ON `ShareCommentMessage` (`threadId`, `createdAt`);
CREATE UNIQUE INDEX `ShareCommentMessage_threadId_sourceMessageId_key`
  ON `ShareCommentMessage` (`threadId`, `sourceMessageId`);

CREATE TABLE `ShareDailyUsage` (
  `date` text NOT NULL,
  `planCount` integer DEFAULT 0 NOT NULL,
  `userId` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  `walkthroughCount` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`userId`, `date`)
);

CREATE TRIGGER `Plan_share_quota`
BEFORE INSERT ON `Plan`
WHEN NEW.`sharedByUserId` IS NOT NULL
BEGIN
  INSERT INTO `ShareDailyUsage` (`date`, `planCount`, `userId`, `walkthroughCount`)
  VALUES (date('now'), 1, NEW.`sharedByUserId`, 0)
  ON CONFLICT (`userId`, `date`) DO UPDATE SET
    `planCount` = `planCount` + 1
  WHERE `planCount` < 50 AND (`planCount` + `walkthroughCount`) < 100;
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'share-quota-exceeded') END;
END;

CREATE TRIGGER `Walkthrough_share_quota`
BEFORE INSERT ON `Walkthrough`
WHEN NEW.`sharedByUserId` IS NOT NULL
BEGIN
  INSERT INTO `ShareDailyUsage` (`date`, `planCount`, `userId`, `walkthroughCount`)
  VALUES (date('now'), 0, NEW.`sharedByUserId`, 1)
  ON CONFLICT (`userId`, `date`) DO UPDATE SET
    `walkthroughCount` = `walkthroughCount` + 1
  WHERE `walkthroughCount` < 50 AND (`planCount` + `walkthroughCount`) < 100;
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'share-quota-exceeded') END;
END;
