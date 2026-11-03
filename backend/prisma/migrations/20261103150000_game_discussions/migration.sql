-- CreateTable
CREATE TABLE `DiscussionThread` (
    `id` CHAR(36) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `game` JSON NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `spoiler` BOOLEAN NOT NULL DEFAULT false,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DiscussionThread_slug_createdAt_id_idx`(`slug`, `createdAt`, `id`),
    INDEX `DiscussionThread_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscussionReply` (
    `id` CHAR(36) NOT NULL,
    `threadId` CHAR(36) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `spoiler` BOOLEAN NOT NULL DEFAULT false,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DiscussionReply_threadId_createdAt_id_idx`(`threadId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscussionReport` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `threadId` CHAR(36) NOT NULL,
    `replyId` CHAR(36) NULL,
    `targetKey` VARCHAR(191) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DiscussionReport_status_createdAt_id_idx`(`status`, `createdAt`, `id`),
    UNIQUE INDEX `DiscussionReport_userId_targetKey_key`(`userId`, `targetKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModerationAction` (
    `id` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `targetKey` VARCHAR(191) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ModerationAction_createdAt_id_idx`(`createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DiscussionThread` ADD CONSTRAINT `DiscussionThread_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscussionReply` ADD CONSTRAINT `DiscussionReply_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `DiscussionThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscussionReply` ADD CONSTRAINT `DiscussionReply_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscussionReport` ADD CONSTRAINT `DiscussionReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscussionReport` ADD CONSTRAINT `DiscussionReport_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `DiscussionThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscussionReport` ADD CONSTRAINT `DiscussionReport_replyId_fkey` FOREIGN KEY (`replyId`) REFERENCES `DiscussionReply`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModerationAction` ADD CONSTRAINT `ModerationAction_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
