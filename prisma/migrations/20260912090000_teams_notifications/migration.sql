-- Microsoft Teams notifications: where a message goes, who it is for, and what
-- happened to it.
--
-- Additive only. Five new tables and no change to any existing column, so a
-- database that already holds a season of assignments comes through untouched
-- and a rollback is a DROP rather than a restore.

CREATE TABLE `teams_targets` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `transport` VARCHAR(16) NOT NULL DEFAULT 'webhook',
    `webhookUrl` TEXT NOT NULL,
    `urlHost` VARCHAR(190) NOT NULL DEFAULT '',
    `urlHint` VARCHAR(8) NOT NULL DEFAULT '',
    `departmentId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NOT NULL,
    `sendCount` INTEGER NOT NULL DEFAULT 0,
    `lastOkAt` DATETIME(3) NULL,
    `lastErrorAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `teams_targets_departmentId_idx`(`departmentId`),
    INDEX `teams_targets_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `teams_identities` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `upn` VARCHAR(190) NOT NULL,
    `aadObjectId` VARCHAR(64) NULL,
    `displayName` VARCHAR(190) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `optedOut` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teams_identities_userId_key`(`userId`),
    INDEX `teams_identities_upn_idx`(`upn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_rules` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('MANUAL', 'ANNOUNCEMENT', 'ASSIGNMENT_NEW', 'ASSIGNMENT_DUE', 'ASSIGNMENT_OVERDUE', 'EVENT_SOON') NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `leadHours` INTEGER NOT NULL DEFAULT 24,
    `minPriority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'LOW',
    `pingPeople` BOOLEAN NOT NULL DEFAULT false,
    `targetId` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_rules_kind_departmentId_key`(`kind`, `departmentId`),
    INDEX `notification_rules_enabled_idx`(`enabled`),
    INDEX `notification_rules_targetId_idx`(`targetId`),
    INDEX `notification_rules_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('MANUAL', 'ANNOUNCEMENT', 'ASSIGNMENT_NEW', 'ASSIGNMENT_DUE', 'ASSIGNMENT_OVERDUE', 'EVENT_SOON') NOT NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `url` TEXT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `departmentId` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,
    `recipientUserId` VARCHAR(191) NULL,
    `mentionUserIds` JSON NULL,
    `sourceType` VARCHAR(32) NULL,
    `sourceId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(190) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `notBefore` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_jobs_dedupeKey_key`(`dedupeKey`),
    INDEX `notification_jobs_status_notBefore_idx`(`status`, `notBefore`),
    INDEX `notification_jobs_departmentId_idx`(`departmentId`),
    INDEX `notification_jobs_recipientUserId_idx`(`recipientUserId`),
    INDEX `notification_jobs_targetId_idx`(`targetId`),
    INDEX `notification_jobs_createdById_idx`(`createdById`),
    INDEX `notification_jobs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
