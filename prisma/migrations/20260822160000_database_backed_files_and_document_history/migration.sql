-- Files that survive a deploy, and documents that survive an edit.
--
-- 1. `files` learns to hold bytes as well as links. `externalUrl` becomes
--    nullable because an uploaded asset has no Drive URL; every existing row
--    keeps its URL and gets storage='link', which is the default, so nothing
--    that already works changes behaviour.
--
-- 2. `file_chunks` holds the bytes, sliced. TiDB refuses a single transaction
--    entry over ~6 MB, so a whole poster in one column would fail on insert.
--
-- 3. `document_revisions` keeps what a document said before each save, so an
--    accidental overwrite is a restore rather than a loss.

ALTER TABLE `files` MODIFY `externalUrl` TEXT NULL;
ALTER TABLE `files` ADD COLUMN `storage` VARCHAR(16) NOT NULL DEFAULT 'link';
ALTER TABLE `files` ADD COLUMN `fileName` VARCHAR(255) NULL;
ALTER TABLE `files` ADD COLUMN `mimeType` VARCHAR(160) NULL;
ALTER TABLE `files` ADD COLUMN `sizeBytes` INTEGER NULL;
ALTER TABLE `files` ADD COLUMN `checksum` VARCHAR(64) NULL;
CREATE INDEX `files_storage_idx` ON `files`(`storage`);

CREATE TABLE `file_chunks` (
    `fileId` VARCHAR(191) NOT NULL,
    `idx` INTEGER NOT NULL,
    `bytes` MEDIUMBLOB NOT NULL,

    PRIMARY KEY (`fileId`, `idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `documents` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `document_revisions` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'external',
    `externalUrl` TEXT NULL,
    `body` LONGTEXT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `editedById` VARCHAR(191) NULL,
    `reason` VARCHAR(16) NOT NULL DEFAULT 'edit',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `document_revisions_documentId_version_key`(`documentId`, `version`),
    INDEX `document_revisions_documentId_idx`(`documentId`),
    INDEX `document_revisions_editedById_idx`(`editedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
