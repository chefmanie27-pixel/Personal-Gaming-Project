-- CreateTable
CREATE TABLE `SteamGameSnapshot` (
    `userId` VARCHAR(191) NOT NULL,
    `appId` INTEGER NOT NULL,
    `minutes` INTEGER NOT NULL,
    `achievements` JSON NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `appId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SteamGameSnapshot` ADD CONSTRAINT `SteamGameSnapshot_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `SteamConnection`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
