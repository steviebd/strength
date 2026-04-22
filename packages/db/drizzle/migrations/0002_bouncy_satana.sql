ALTER TABLE `nutrition_chat_messages` ADD `event_timezone` text;--> statement-breakpoint
ALTER TABLE `nutrition_entries` ADD `logged_at_utc` integer;--> statement-breakpoint
ALTER TABLE `nutrition_entries` ADD `logged_timezone` text;--> statement-breakpoint
ALTER TABLE `nutrition_training_context` ADD `event_timezone` text;--> statement-breakpoint
ALTER TABLE `program_cycle_workouts` ADD `scheduled_timezone` text;--> statement-breakpoint
ALTER TABLE `workout_sets` ADD `completed_timezone` text;--> statement-breakpoint
ALTER TABLE `workout_sets` ADD `completed_local_date` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `started_timezone` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `started_local_date` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `completed_timezone` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `completed_local_date` text;