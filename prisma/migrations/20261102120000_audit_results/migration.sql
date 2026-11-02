-- Audit results: every entry says whether the action succeeded, failed or was
-- denied, and why. Additive only; existing rows read as "success".
ALTER TABLE `audit_log`
    ADD COLUMN `result` VARCHAR(16) NOT NULL DEFAULT 'success',
    ADD COLUMN `reason` TEXT NULL;

CREATE INDEX `audit_log_result_idx` ON `audit_log`(`result`);
