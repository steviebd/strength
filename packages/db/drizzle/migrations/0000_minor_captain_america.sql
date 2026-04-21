CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`muscle_group` text,
	`description` text,
	`library_id` text,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `nutrition_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`has_image` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `nutrition_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meal_type` text,
	`name` text,
	`calories` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`ai_analysis` text,
	`logged_at` text NOT NULL,
	`date` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `nutrition_training_context` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`training_type` text NOT NULL,
	`custom_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `program_cycle_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`template_id` text,
	`week_number` integer NOT NULL,
	`session_number` integer NOT NULL,
	`session_name` text NOT NULL,
	`target_lifts` text,
	`is_complete` integer DEFAULT false,
	`workout_id` text,
	`created_at` integer,
	`updated_at` integer,
	`scheduled_date` text,
	`scheduled_time` text,
	FOREIGN KEY (`cycle_id`) REFERENCES `user_program_cycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`window_start` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `template_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`target_weight` real,
	`added_weight` real DEFAULT 0,
	`sets` integer,
	`reps` integer,
	`reps_raw` text,
	`is_amrap` integer DEFAULT false,
	`is_accessory` integer DEFAULT false,
	`is_required` integer DEFAULT true,
	`set_number` integer,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`notes` text,
	`program_cycle_id` text,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_body_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bodyweight_kg` real,
	`height_cm` real,
	`target_calories` integer,
	`target_protein_g` integer,
	`target_carbs_g` integer,
	`target_fat_g` integer,
	`recorded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_body_stats_user_id_unique` ON `user_body_stats` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_integration` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`scope` text,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`weight_unit` text DEFAULT 'kg',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_program_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_slug` text NOT NULL,
	`name` text NOT NULL,
	`squat_1rm` real NOT NULL,
	`bench_1rm` real NOT NULL,
	`deadlift_1rm` real NOT NULL,
	`ohp_1rm` real NOT NULL,
	`starting_squat_1rm` real,
	`starting_bench_1rm` real,
	`starting_deadlift_1rm` real,
	`starting_ohp_1rm` real,
	`current_week` integer DEFAULT 1,
	`current_session` integer DEFAULT 1,
	`total_sessions_completed` integer DEFAULT 0,
	`total_sessions_planned` integer NOT NULL,
	`estimated_weeks` integer,
	`status` text DEFAULT 'active',
	`is_complete` integer DEFAULT false,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer,
	`preferred_gym_days` text,
	`preferred_time_of_day` text,
	`program_start_date` text,
	`first_session_date` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `whoop_body_measurement` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`whoop_measurement_id` text NOT NULL,
	`height_meter` real,
	`weight_kilogram` real,
	`max_heart_rate` integer,
	`measurement_date` integer,
	`raw_data` text,
	`webhook_received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whoop_body_measurement_whoop_measurement_id_unique` ON `whoop_body_measurement` (`whoop_measurement_id`);--> statement-breakpoint
CREATE TABLE `whoop_cycle` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`whoop_cycle_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`timezone_offset` text,
	`day_strain` real,
	`average_heart_rate` integer,
	`max_heart_rate` integer,
	`kilojoule` real,
	`percent_recorded` real,
	`distance_meter` integer,
	`altitude_gain_meter` integer,
	`altitude_change_meter` integer,
	`raw_data` text,
	`webhook_received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whoop_cycle_whoop_cycle_id_unique` ON `whoop_cycle` (`whoop_cycle_id`);--> statement-breakpoint
CREATE TABLE `whoop_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`whoop_user_id` text NOT NULL,
	`email` text,
	`first_name` text,
	`last_name` text,
	`raw_data` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whoop_profile_whoop_user_id_unique` ON `whoop_profile` (`whoop_user_id`);--> statement-breakpoint
CREATE TABLE `whoop_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`whoop_recovery_id` text NOT NULL,
	`cycle_id` text,
	`date` integer NOT NULL,
	`recovery_score` integer,
	`hrv_rmssd_milli` real,
	`hrv_rmssd_baseline` real,
	`resting_heart_rate` integer,
	`resting_heart_rate_baseline` integer,
	`respiratory_rate` real,
	`respiratory_rate_baseline` real,
	`raw_data` text,
	`recovery_score_tier` text,
	`timezone_offset` text,
	`webhook_received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whoop_recovery_whoop_recovery_id_unique` ON `whoop_recovery` (`whoop_recovery_id`);--> statement-breakpoint
CREATE TABLE `whoop_sleep` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`whoop_sleep_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`timezone_offset` text,
	`sleep_performance_percentage` integer,
	`total_sleep_time_milli` integer,
	`sleep_efficiency_percentage` real,
	`slow_wave_sleep_time_milli` integer,
	`rem_sleep_time_milli` integer,
	`light_sleep_time_milli` integer,
	`wake_time_milli` integer,
	`arousal_time_milli` integer,
	`disturbance_count` integer,
	`sleep_latency_milli` integer,
	`sleep_consistency_percentage` real,
	`sleep_need_baseline_milli` integer,
	`sleep_need_from_sleep_debt_milli` integer,
	`sleep_need_from_recent_strain_milli` integer,
	`sleep_need_from_recent_nap_milli` integer,
	`raw_data` text,
	`sleep_quality_tier` text,
	`webhook_received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whoop_sleep_whoop_sleep_id_unique` ON `whoop_sleep` (`whoop_sleep_id`);--> statement-breakpoint
CREATE TABLE `whoop_workout` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`whoop_workout_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`timezone_offset` text,
	`sport_name` text,
	`score_state` text,
	`score` text,
	`during` text,
	`zone_duration` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whoop_workout_whoop_workout_id_unique` ON `whoop_workout` (`whoop_workout_id`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`notes` text,
	`is_amrap` integer DEFAULT false,
	`set_number` integer,
	`is_deleted` integer DEFAULT false,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`rpe` real,
	`is_complete` integer DEFAULT false,
	`completed_at` integer,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`program_cycle_id` text,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`completed_date` text,
	`notes` text,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`squat_1rm` real,
	`bench_1rm` real,
	`deadlift_1rm` real,
	`ohp_1rm` real,
	`starting_squat_1rm` real,
	`starting_bench_1rm` real,
	`starting_deadlift_1rm` real,
	`starting_ohp_1rm` real,
	`total_volume` real,
	`total_sets` integer,
	`duration_minutes` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE set null
);
