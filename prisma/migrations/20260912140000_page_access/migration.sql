-- Page access: which tier may open which page, and how far in.
--
-- Additive only. One new table, no change to any existing column, and an empty
-- table means "every default in src/lib/pages.ts stands" — so a database that
-- has never seen this migration and one that has behave identically until the
-- owner actually changes a cell.

CREATE TABLE `page_access` (
    `page` VARCHAR(48) NOT NULL,
    `tier` ENUM('T0_ADVISOR', 'T1_MEMBER', 'T2_HEAD', 'T3_ADMIN', 'T4_OWNER') NOT NULL,
    `level` ENUM('NONE', 'READ', 'COMMENT', 'EDIT') NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`page`, `tier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
