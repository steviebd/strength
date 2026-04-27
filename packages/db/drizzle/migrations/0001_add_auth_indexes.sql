CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);