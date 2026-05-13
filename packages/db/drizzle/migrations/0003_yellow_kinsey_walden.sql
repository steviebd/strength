PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_custom_program_workout_exercises` (
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
	`target_duration` real,
	`target_distance` real,
	`target_height` real,
	`is_amrap` integer DEFAULT false,
	`is_accessory` integer DEFAULT false,
	`is_required` integer DEFAULT true,
	`set_number` integer,
	`progression_amount` real,
	`progression_interval` integer DEFAULT 1,
	`progression_type` text DEFAULT 'fixed',
	FOREIGN KEY (`custom_program_workout_id`) REFERENCES `custom_program_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_custom_program_workout_exercises`("id", "custom_program_workout_id", "exercise_id", "order_index", "exercise_type", "sets", "reps", "reps_raw", "weight_mode", "fixed_weight", "percentage_of_lift", "percentage_lift", "added_weight", "target_duration", "target_distance", "target_height", "is_amrap", "is_accessory", "is_required", "set_number", "progression_amount", "progression_interval", "progression_type") SELECT "id", "custom_program_workout_id", "exercise_id", "order_index", "exercise_type", "sets", "reps", "reps_raw", "weight_mode", "fixed_weight", "percentage_of_lift", "percentage_lift", "added_weight", "target_duration", "target_distance", "target_height", "is_amrap", "is_accessory", "is_required", "set_number", "progression_amount", "progression_interval", "progression_type" FROM `custom_program_workout_exercises`;--> statement-breakpoint
DROP TABLE `custom_program_workout_exercises`;--> statement-breakpoint
ALTER TABLE `__new_custom_program_workout_exercises` RENAME TO `custom_program_workout_exercises`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_custom_program_workout_exercises_workout_order` ON `custom_program_workout_exercises` (`custom_program_workout_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `__new_template_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`target_weight` real,
	`added_weight` real DEFAULT 0,
	`sets` integer,
	`reps` real,
	`reps_raw` text,
	`exercise_type` text NOT NULL,
	`target_duration` real,
	`target_distance` real,
	`target_height` real,
	`is_amrap` integer DEFAULT false,
	`is_accessory` integer DEFAULT false,
	`is_required` integer DEFAULT true,
	`set_number` integer,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_template_exercises`("id", "template_id", "exercise_id", "order_index", "target_weight", "added_weight", "sets", "reps", "reps_raw", "exercise_type", "target_duration", "target_distance", "target_height", "is_amrap", "is_accessory", "is_required", "set_number") SELECT "id", "template_id", "exercise_id", "order_index", "target_weight", "added_weight", "sets", "reps", "reps_raw", "exercise_type", "target_duration", "target_distance", "target_height", "is_amrap", "is_accessory", "is_required", "set_number" FROM `template_exercises`;--> statement-breakpoint
DROP TABLE `template_exercises`;--> statement-breakpoint
ALTER TABLE `__new_template_exercises` RENAME TO `template_exercises`;--> statement-breakpoint
CREATE TABLE `__new_workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` real,
	`duration` real,
	`distance` real,
	`height` real,
	`rpe` real,
	`is_complete` integer DEFAULT false,
	`completed_at` integer,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workout_sets`("id", "workout_exercise_id", "set_number", "weight", "reps", "duration", "distance", "height", "rpe", "is_complete", "completed_at", "is_deleted", "created_at", "updated_at") SELECT "id", "workout_exercise_id", "set_number", "weight", "reps", "duration", "distance", "height", "rpe", "is_complete", "completed_at", "is_deleted", "created_at", "updated_at" FROM `workout_sets`;--> statement-breakpoint
DROP TABLE `workout_sets`;--> statement-breakpoint
ALTER TABLE `__new_workout_sets` RENAME TO `workout_sets`;--> statement-breakpoint
CREATE INDEX `idx_workout_sets_exercise_set_number` ON `workout_sets` (`workout_exercise_id`,`set_number`);