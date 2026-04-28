CREATE TABLE `workout_sync_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`request_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sync_operations_user_id_id_unique` ON `workout_sync_operations` (`user_id`,`id`);
