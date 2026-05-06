CREATE TABLE `user_bodyweight_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bodyweight_kg` real NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bodyweight_history_user_recorded` ON `user_bodyweight_history` (`user_id`,`recorded_at`);