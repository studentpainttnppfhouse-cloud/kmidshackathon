-- Join links (an organisation-wide invite), and attachments stored as bytes.
--
-- Nothing here alters an existing column's meaning. `users` gains one nullable
-- column; every other statement creates a new table. A database that already
-- holds data comes through unchanged.

ALTER TABLE `users` ADD COLUMN `joinedViaLinkId` VARCHAR(191) NULL;
CREATE INDEX `users_joinedViaLinkId_idx` ON `users`(`joinedViaLinkId`);

CREATE TABLE `invite_links` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `tier` ENUM('T0_ADVISOR', 'T1_MEMBER', 'T2_HEAD', 'T3_ADMIN', 'T4_OWNER') NOT NULL DEFAULT 'T1_MEMBER',
    `departmentId` VARCHAR(191) NULL,
    `roleTitle` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `maxUses` INTEGER NULL,
    `useCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invite_links_code_key`(`code`),
    INDEX `invite_links_createdById_idx`(`createdById`),
    INDEX `invite_links_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attachments` (
    `id` VARCHAR(191) NOT NULL,
    `parentType` VARCHAR(32) NOT NULL,
    `parentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `checksum` VARCHAR(64) NOT NULL DEFAULT '',
    `storage` VARCHAR(8) NOT NULL DEFAULT 'db',
    `externalUrl` TEXT NULL,
    `departmentId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attachments_parentType_parentId_idx`(`parentType`, `parentId`),
    INDEX `attachments_uploadedById_idx`(`uploadedById`),
    INDEX `attachments_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attachment_chunks` (
    `id` VARCHAR(191) NOT NULL,
    `attachmentId` VARCHAR(191) NOT NULL,
    `idx` INTEGER NOT NULL,
    `bytes` MEDIUMBLOB NOT NULL,

    UNIQUE INDEX `attachment_chunks_attachmentId_idx_key`(`attachmentId`, `idx`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- An asset can now be the file itself rather than a link to it. Every existing
-- row keeps its URL; only the NOT NULL goes away, so nothing already stored
-- changes meaning.
ALTER TABLE `files` MODIFY `externalUrl` TEXT NULL;
