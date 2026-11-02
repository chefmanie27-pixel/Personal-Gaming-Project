CREATE TABLE `UserWorkspace` (
 `id` VARCHAR(191) NOT NULL,
 `userId` VARCHAR(191) NOT NULL,
 `data` JSON NOT NULL,
 `version` INTEGER NOT NULL DEFAULT 0,
 `updatedAt` DATETIME(3) NOT NULL,
 UNIQUE INDEX `UserWorkspace_userId_key`(`userId`),
 PRIMARY KEY (`id`),
 CONSTRAINT `UserWorkspace_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
