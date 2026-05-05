CREATE UNIQUE INDEX IF NOT EXISTS `rate_limit_user_id_endpoint_unique` ON `rate_limit` (`user_id`, `endpoint`);
