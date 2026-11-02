-- Additive migration. Existing users, games, wishlists and alerts are unchanged.
CREATE TABLE `LibraryEntry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `game` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'Want to Play',
    `favorite` BOOLEAN NOT NULL DEFAULT false,
    `rating` DOUBLE NULL,
    `hours` DOUBLE NOT NULL DEFAULT 0,
    `notes` TEXT NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `LibraryEntry_userId_slug_key`(`userId`, `slug`),
    INDEX `LibraryEntry_userId_addedAt_idx`(`userId`, `addedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `LibraryEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
