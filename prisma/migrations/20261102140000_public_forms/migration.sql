-- Public forms: the email a respondent gives before answering.
ALTER TABLE `form_responses` ADD COLUMN `respondentEmail` VARCHAR(254) NULL;
CREATE INDEX `form_responses_formId_respondentEmail_idx` ON `form_responses`(`formId`, `respondentEmail`);
