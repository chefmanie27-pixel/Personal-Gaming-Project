ALTER TABLE `UserWorkspace` ADD COLUMN `journalMigrated` BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE `JournalRecord` (
 `userId` VARCHAR(191) NOT NULL, `id` CHAR(36) NOT NULL,
 `slug` VARCHAR(191) NOT NULL, `title` VARCHAR(500) NOT NULL,
 `game` JSON NOT NULL, `entryDate` DATE NOT NULL,
 `kind` VARCHAR(16) NOT NULL, `minutes` INTEGER NOT NULL,
 `notes` TEXT NOT NULL, `progress` TEXT NOT NULL,
 `tags` JSON NOT NULL, `spoiler` BOOLEAN NOT NULL DEFAULT false,
 `rating` DOUBLE NULL, `version` INTEGER NOT NULL DEFAULT 0,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`userId`,`id`),
 INDEX `JournalRecord_userId_entryDate_id_idx` (`userId`,`entryDate`,`id`),
 INDEX `JournalRecord_userId_kind_entryDate_id_idx` (`userId`,`kind`,`entryDate`,`id`),
 CONSTRAINT `JournalRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
