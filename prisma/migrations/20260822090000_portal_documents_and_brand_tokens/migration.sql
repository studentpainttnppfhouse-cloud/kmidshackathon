-- Documents written inside the portal, and a brand kit that is data.
--
-- `externalUrl` becomes nullable: a document authored here has a body instead
-- of a Drive link. Every existing row keeps its URL and gets source='external',
-- which is the default, so nothing that already works changes behaviour.

ALTER TABLE `documents` MODIFY `externalUrl` TEXT NULL;
ALTER TABLE `documents` ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'external';
ALTER TABLE `documents` ADD COLUMN `body` LONGTEXT NULL;
ALTER TABLE `documents` ADD COLUMN `assignmentId` VARCHAR(191) NULL;
CREATE INDEX `documents_assignmentId_idx` ON `documents`(`assignmentId`);

CREATE TABLE `brand_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'color',
    `name` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `groupName` VARCHAR(60) NULL,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `brand_tokens_kind_idx`(`kind`),
    INDEX `brand_tokens_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
