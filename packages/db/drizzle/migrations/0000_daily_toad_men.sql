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
	`exercise_type` text,
	`is_amrap` integer DEFAULT false,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_user_id_name_unique` ON `exercises` (`user_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `idx_exercises_user_deleted_created_at` ON `exercises` (`user_id`,`is_deleted`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_exercises_user_deleted_lower_name` ON `exercises` (`user_id`,`is_deleted`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_user_id_library_id_unique` ON `exercises` (`user_id`,`library_id`);--> statement-breakpoint
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
	`sync_operation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nutrition_chat_jobs_user_status_created` ON `nutrition_chat_jobs` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_chat_jobs_user_id_sync_operation_id_unique` ON `nutrition_chat_jobs` (`user_id`,`sync_operation_id`);--> statement-breakpoint
CREATE TABLE `nutrition_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`has_image` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nutrition_chat_messages_user_id_created_at` ON `nutrition_chat_messages` (`user_id`,`created_at`);--> statement-breakpoint
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
	`logged_at` integer NOT NULL,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nutrition_entries_query` ON `nutrition_entries` (`user_id`,`is_deleted`,`logged_at`);--> statement-breakpoint
CREATE TABLE `nutrition_training_context` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`training_type` text NOT NULL,
	`custom_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_training_context_user_id_unique` ON `nutrition_training_context` (`user_id`);--> statement-breakpoint
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
	`scheduled_at` integer,
	FOREIGN KEY (`cycle_id`) REFERENCES `user_program_cycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_program_cycle_workouts_cycle_order` ON `program_cycle_workouts` (`cycle_id`,`week_number`,`session_number`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
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
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
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
	`exercise_type` text NOT NULL,
	`target_duration` integer,
	`target_distance` integer,
	`target_height` integer,
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
	`default_weight_increment` real DEFAULT 2.5,
	`default_bodyweight_increment` real DEFAULT 2,
	`default_cardio_increment` real DEFAULT 60,
	`default_timed_increment` real DEFAULT 5,
	`default_plyo_increment` real DEFAULT 1,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_templates_user_deleted_created_at` ON `templates` (`user_id`,`is_deleted`,`created_at`);--> statement-breakpoint
CREATE TABLE `token_refresh_lock` (
	`integration_id` text PRIMARY KEY NOT NULL,
	`locked_at` integer NOT NULL,
	`expires_at` integer NOT NULL
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
CREATE INDEX `idx_bodyweight_history_user_recorded` ON `user_bodyweight_history` (`user_id`,`recorded_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `user_integration_user_id_provider_unique` ON `user_integration` (`user_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_integration_provider_provider_user_id_unique` ON `user_integration` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`weight_unit` text DEFAULT 'kg',
	`distance_unit` text DEFAULT 'km',
	`height_unit` text DEFAULT 'cm',
	`timezone` text,
	`weight_prompted_at` integer,
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
	`program_start_at` integer,
	`first_session_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_program_cycles_user_status_started_at` ON `user_program_cycles` (`user_id`,`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `webhook_event_log` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` integer NOT NULL
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
	`duration` integer,
	`distance` integer,
	`height` integer,
	`rpe` real,
	`is_complete` integer DEFAULT false,
	`completed_at` integer,
	`is_deleted` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workout_sets_exercise_set_number` ON `workout_sets` (`workout_exercise_id`,`set_number`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `workout_sync_operations_user_id_id_unique` ON `workout_sync_operations` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`program_cycle_id` text,
	`workout_type` text DEFAULT 'training' NOT NULL,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
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
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`program_cycle_id`) REFERENCES `user_program_cycles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_workouts_user_deleted_started_at` ON `workouts` (`user_id`,`is_deleted`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_workouts_user_deleted_completed_at` ON `workouts` (`user_id`,`is_deleted`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_exercises_muscle_group` ON `exercises` (`muscle_group`);--> statement-breakpoint
CREATE INDEX `idx_workouts_template_id` ON `workouts` (`template_id`);--> statement-breakpoint
CREATE INDEX `idx_workout_exercises_order` ON `workout_exercises` (`workout_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `idx_workout_exercises_exercise_id` ON `workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `idx_program_cycle_workouts_scheduled_at` ON `program_cycle_workouts` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `idx_template_exercises_template_id` ON `template_exercises` (`template_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `idx_whoop_profile_user_id` ON `whoop_profile` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_whoop_workout_user_id_start` ON `whoop_workout` (`user_id`,`start`);--> statement-breakpoint
CREATE INDEX `idx_whoop_recovery_user_id_date` ON `whoop_recovery` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_whoop_recovery_cycle_id` ON `whoop_recovery` (`cycle_id`);--> statement-breakpoint
CREATE INDEX `idx_whoop_cycle_user_id_start` ON `whoop_cycle` (`user_id`,`start`);--> statement-breakpoint
CREATE INDEX `idx_whoop_sleep_user_id_start` ON `whoop_sleep` (`user_id`,`start`);--> statement-breakpoint
CREATE INDEX `idx_whoop_sleep_user_id_sleep_performance` ON `whoop_sleep` (`user_id`,`sleep_performance_percentage`);--> statement-breakpoint
CREATE INDEX `idx_whoop_body_measurement_user_id_measurement_date` ON `whoop_body_measurement` (`user_id`,`measurement_date`);--> statement-breakpoint
CREATE INDEX `idx_rate_limit_window_start` ON `rate_limit` (`window_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_user_id_endpoint_unique` ON `rate_limit` (`user_id`,`endpoint`);
