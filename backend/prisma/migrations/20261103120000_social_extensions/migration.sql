-- AlterTable
ALTER TABLE `PublishedCollection` ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `CollectionMember` (
    `collectionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `accepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CollectionMember_userId_accepted_createdAt_idx`(`userId`, `accepted`, `createdAt`),
    PRIMARY KEY (`collectionId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UsernameAlias` (
    `username` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `UsernameAlias_userId_idx`(`userId`),
    PRIMARY KEY (`username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArtworkUpload` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bytes` MEDIUMBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ArtworkUpload_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CollectionMember` ADD CONSTRAINT `CollectionMember_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `PublishedCollection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionMember` ADD CONSTRAINT `CollectionMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UsernameAlias` ADD CONSTRAINT `UsernameAlias_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArtworkUpload` ADD CONSTRAINT `ArtworkUpload_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
