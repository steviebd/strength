CREATE TABLE `nutrition_chat_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`messages_json` text NOT NULL,
	`date` text NOT NULL,
	`has_image` integer DEFAULT false,
	`image_base64` text,
	`assistant_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nutrition_chat_jobs_user_status_created` ON `nutrition_chat_jobs` (`user_id`,`status`,`created_at`);
