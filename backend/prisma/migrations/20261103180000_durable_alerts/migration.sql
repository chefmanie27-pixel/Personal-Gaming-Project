-- CreateTable
CREATE TABLE `DurableAlertJob` (
    `name` VARCHAR(64) NOT NULL,
    `cursor` VARCHAR(191) NULL,
    `leaseToken` CHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `nextRunAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `failures` INTEGER NOT NULL DEFAULT 0,
    `lastFinishedAt` DATETIME(3) NULL,
    `lastErrorCode` VARCHAR(64) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `mode` VARCHAR(32) NOT NULL,
    `outcome` VARCHAR(16) NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AlertDelivery_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    UNIQUE INDEX `AlertDelivery_userId_alertId_observationId_key`(`userId`, `alertId`, `observationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AlertDelivery` ADD CONSTRAINT `AlertDelivery_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

