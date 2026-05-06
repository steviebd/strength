CREATE TABLE `token_refresh_lock` (
	`integration_id` text PRIMARY KEY NOT NULL,
	`locked_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
