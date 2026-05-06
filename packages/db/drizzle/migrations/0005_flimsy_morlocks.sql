DROP INDEX IF EXISTS `idx_nutrition_entries_user_logged_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_nutrition_entries_user_deleted`;
--> statement-breakpoint
CREATE TABLE `home_summary` (
	`user_id` text PRIMARY KEY NOT NULL,
	`streak_count` integer DEFAULT 0,
	`last_workout_date` integer,
	`weekly_volume` real DEFAULT 0,
	`weekly_workouts` integer DEFAULT 0,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nutrition_chat_messages_user_id_created_at` ON `nutrition_chat_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_nutrition_entries_query` ON `nutrition_entries` (`user_id`,`is_deleted`,`logged_at`);--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_workouts_user_id_completed_at` ON `workouts` (`user_id`,`completed_at`);