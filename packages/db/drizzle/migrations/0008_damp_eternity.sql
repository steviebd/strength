ALTER TABLE `exercises` ADD `exercise_type` text;--> statement-breakpoint
ALTER TABLE `exercises` ADD `is_amrap` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `template_exercises` ADD `exercise_type` text NOT NULL DEFAULT 'weighted';--> statement-breakpoint
ALTER TABLE `template_exercises` ADD `target_duration` integer;--> statement-breakpoint
ALTER TABLE `template_exercises` ADD `target_distance` integer;--> statement-breakpoint
ALTER TABLE `template_exercises` ADD `target_height` integer;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `distance_unit` text DEFAULT 'km';--> statement-breakpoint
ALTER TABLE `workout_sets` ADD `duration` integer;--> statement-breakpoint
ALTER TABLE `workout_sets` ADD `distance` integer;--> statement-breakpoint
ALTER TABLE `workout_sets` ADD `height` integer;
