-- CreateTable
CREATE TABLE `SocialProfile` (
    `userId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `bio` VARCHAR(1000) NOT NULL,
    `avatar` VARCHAR(1024) NOT NULL,
    `banner` VARCHAR(1024) NOT NULL,
    `visibility` VARCHAR(16) NOT NULL DEFAULT 'private',
    `shareLibrary` BOOLEAN NOT NULL DEFAULT false,
    `settings` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SocialProfile_username_key`(`username`),
    INDEX `SocialProfile_visibility_username_idx`(`visibility`, `username`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FollowEdge` (
    `followerId` VARCHAR(191) NOT NULL,
    `followedId` VARCHAR(191) NOT NULL,
    `accepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FollowEdge_followedId_accepted_createdAt_idx`(`followedId`, `accepted`, `createdAt`),
    PRIMARY KEY (`followerId`, `followedId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockEdge` (
    `blockerId` VARCHAR(191) NOT NULL,
    `blockedId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BlockEdge_blockedId_idx`(`blockedId`),
    PRIMARY KEY (`blockerId`, `blockedId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommunityReview` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `game` JSON NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `rating` DOUBLE NOT NULL,
    `spoiler` BOOLEAN NOT NULL DEFAULT false,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CommunityReview_slug_createdAt_id_idx`(`slug`, `createdAt`, `id`),
    INDEX `CommunityReview_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    UNIQUE INDEX `CommunityReview_userId_slug_key`(`userId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewLike` (
    `userId` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReviewLike_reviewId_idx`(`reviewId`),
    PRIMARY KEY (`userId`, `reviewId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewReport` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReviewReport_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `ReviewReport_userId_reviewId_key`(`userId`, `reviewId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishedCollection` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(2000) NOT NULL,
    `cover` VARCHAR(1024) NOT NULL,
    `theme` VARCHAR(80) NOT NULL,
    `visibility` VARCHAR(16) NOT NULL DEFAULT 'private',
    `games` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PublishedCollection_visibility_createdAt_id_idx`(`visibility`, `createdAt`, `id`),
    INDEX `PublishedCollection_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectionFollow` (
    `userId` VARCHAR(191) NOT NULL,
    `collectionId` VARCHAR(191) NOT NULL,

    INDEX `CollectionFollow_collectionId_idx`(`collectionId`),
    PRIMARY KEY (`userId`, `collectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialActivity` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialActivity_createdAt_id_idx`(`createdAt`, `id`),
    INDEX `SocialActivity_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    UNIQUE INDEX `SocialActivity_userId_kind_entityId_key`(`userId`, `kind`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AchievementUnlock` (
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `unlockedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialNotification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dedupe` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `message` VARCHAR(500) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialNotification_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    INDEX `SocialNotification_userId_readAt_idx`(`userId`, `readAt`),
    UNIQUE INDEX `SocialNotification_userId_dedupe_key`(`userId`, `dedupe`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SteamConnection` (
    `userId` VARCHAR(191) NOT NULL,
    `steamId` VARCHAR(17) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'idle',
    `processed` INTEGER NOT NULL DEFAULT 0,
    `lastSyncedAt` DATETIME(3) NULL,
    `leaseUntil` DATETIME(3) NULL,

    UNIQUE INDEX `SteamConnection_steamId_key`(`steamId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SocialProfile` ADD CONSTRAINT `SocialProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowEdge` ADD CONSTRAINT `FollowEdge_followerId_fkey` FOREIGN KEY (`followerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowEdge` ADD CONSTRAINT `FollowEdge_followedId_fkey` FOREIGN KEY (`followedId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockEdge` ADD CONSTRAINT `BlockEdge_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlockEdge` ADD CONSTRAINT `BlockEdge_blockedId_fkey` FOREIGN KEY (`blockedId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommunityReview` ADD CONSTRAINT `CommunityReview_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewLike` ADD CONSTRAINT `ReviewLike_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewLike` ADD CONSTRAINT `ReviewLike_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `CommunityReview`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewReport` ADD CONSTRAINT `ReviewReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewReport` ADD CONSTRAINT `ReviewReport_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `CommunityReview`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishedCollection` ADD CONSTRAINT `PublishedCollection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionFollow` ADD CONSTRAINT `CollectionFollow_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionFollow` ADD CONSTRAINT `CollectionFollow_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `PublishedCollection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialActivity` ADD CONSTRAINT `SocialActivity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchievementUnlock` ADD CONSTRAINT `AchievementUnlock_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialNotification` ADD CONSTRAINT `SocialNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SteamConnection` ADD CONSTRAINT `SteamConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
