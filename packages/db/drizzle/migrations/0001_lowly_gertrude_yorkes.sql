CREATE TABLE `custom_program_workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`custom_program_workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`exercise_type` text NOT NULL,
	`sets` integer,
	`reps` integer,
	`reps_raw` text,
	`weight_mode` text,
	`fixed_weight` real,
	`percentage_of_lift` real,
	`percentage_lift` text,
	`added_weight` real DEFAULT 0,
	`target_duration` integer,
	`target_distance` integer,
	`target_height` integer,
	`is_amrap` integer DEFAULT false,
	`is_accessory` integer DEFAULT false,
	`is_required` integer DEFAULT true,
	`set_number` integer,
	`progression_amount` real,
	`progression_interval` integer DEFAULT 1,
	FOREIGN KEY (`custom_program_workout_id`) REFERENCES `custom_program_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_custom_program_workout_exercises_workout_order` ON `custom_program_workout_exercises` (`custom_program_workout_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `custom_program_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`custom_program_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`name` text NOT NULL,
	`order_index` integer NOT NULL,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`custom_program_id`) REFERENCES `custom_programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_custom_program_workouts_program_day` ON `custom_program_workouts` (`custom_program_id`,`day_index`);--> statement-breakpoint
CREATE TABLE `custom_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`notes` text,
	`days_per_week` integer NOT NULL,
	`weeks` integer NOT NULL,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_custom_programs_user_deleted_created_at` ON `custom_programs` (`user_id`,`is_deleted`,`created_at`);