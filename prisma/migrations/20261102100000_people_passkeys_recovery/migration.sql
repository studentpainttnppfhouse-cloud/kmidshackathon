-- People workstream: usernames, passkeys, account recovery, in-portal notices.
-- Additive only.

ALTER TABLE `users` ADD COLUMN `username` VARCHAR(64) NULL;
CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);

CREATE TABLE `passkeys` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(512) NOT NULL,
    `publicKey` BLOB NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `transports` VARCHAR(191) NULL,
    `deviceType` VARCHAR(32) NULL,
    `backedUp` BOOLEAN NOT NULL DEFAULT false,
    `label` VARCHAR(80) NOT NULL DEFAULT 'Passkey',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `passkeys_credentialId_key`(`credentialId`),
    INDEX `passkeys_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `recovery_requests` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('USERNAME', 'PASSWORD', 'EMAIL', 'OTHER') NOT NULL DEFAULT 'PASSWORD',
    `contact` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NULL,
    `message` TEXT NULL,
    `matchedUserId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED') NOT NULL DEFAULT 'PENDING',
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolution` TEXT NULL,
    `resetId` VARCHAR(191) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `recovery_requests_status_idx`(`status`),
    INDEX `recovery_requests_matchedUserId_idx`(`matchedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `portal_notices` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `href` VARCHAR(255) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `portal_notices_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `avatar_images` (
    `userId` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(32) NOT NULL,
    `bytes` MEDIUMBLOB NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
