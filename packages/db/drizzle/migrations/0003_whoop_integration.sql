CREATE TABLE `user_integration` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_user_id` text,
  `access_token` text NOT NULL,
  `refresh_token` text,
  `access_token_expires_at` integer,
  `scope` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

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

CREATE UNIQUE INDEX `whoop_profile_whoop_user_id_unique` ON `whoop_profile` (`whoop_user_id`);

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

CREATE UNIQUE INDEX `whoop_workout_whoop_workout_id_unique` ON `whoop_workout` (`whoop_workout_id`);

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

CREATE UNIQUE INDEX `whoop_recovery_whoop_recovery_id_unique` ON `whoop_recovery` (`whoop_recovery_id`);

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

CREATE UNIQUE INDEX `whoop_cycle_whoop_cycle_id_unique` ON `whoop_cycle` (`whoop_cycle_id`);

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

CREATE UNIQUE INDEX `whoop_sleep_whoop_sleep_id_unique` ON `whoop_sleep` (`whoop_sleep_id`);

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

CREATE UNIQUE INDEX `whoop_body_measurement_whoop_measurement_id_unique` ON `whoop_body_measurement` (`whoop_measurement_id`);

CREATE TABLE `rate_limit` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `endpoint` text NOT NULL,
  `requests` integer NOT NULL DEFAULT 0,
  `window_start` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_user_integration_user_id` ON `user_integration` (`user_id`);
CREATE INDEX `idx_user_integration_provider` ON `user_integration` (`provider`);
CREATE INDEX `idx_user_integration_user_id_provider` ON `user_integration` (`user_id`, `provider`);

CREATE INDEX `idx_whoop_profile_user_id` ON `whoop_profile` (`user_id`);
CREATE INDEX `idx_whoop_profile_whoop_user_id` ON `whoop_profile` (`whoop_user_id`);

CREATE INDEX `idx_whoop_workout_user_id` ON `whoop_workout` (`user_id`);
CREATE INDEX `idx_whoop_workout_whoop_workout_id` ON `whoop_workout` (`whoop_workout_id`);
CREATE INDEX `idx_whoop_workout_start` ON `whoop_workout` (`start`);
CREATE INDEX `idx_whoop_workout_user_id_start` ON `whoop_workout` (`user_id`, `start`);

CREATE INDEX `idx_whoop_recovery_user_id` ON `whoop_recovery` (`user_id`);
CREATE INDEX `idx_whoop_recovery_whoop_recovery_id` ON `whoop_recovery` (`whoop_recovery_id`);
CREATE INDEX `idx_whoop_recovery_date` ON `whoop_recovery` (`date`);
CREATE INDEX `idx_whoop_recovery_user_id_date` ON `whoop_recovery` (`user_id`, `date`);
CREATE INDEX `idx_whoop_recovery_cycle_id` ON `whoop_recovery` (`cycle_id`);

CREATE INDEX `idx_whoop_cycle_user_id` ON `whoop_cycle` (`user_id`);
CREATE INDEX `idx_whoop_cycle_whoop_cycle_id` ON `whoop_cycle` (`whoop_cycle_id`);
CREATE INDEX `idx_whoop_cycle_start` ON `whoop_cycle` (`start`);
CREATE INDEX `idx_whoop_cycle_user_id_start` ON `whoop_cycle` (`user_id`, `start`);
CREATE INDEX `idx_whoop_cycle_day_strain` ON `whoop_cycle` (`day_strain`);

CREATE INDEX `idx_whoop_sleep_user_id` ON `whoop_sleep` (`user_id`);
CREATE INDEX `idx_whoop_sleep_whoop_sleep_id` ON `whoop_sleep` (`whoop_sleep_id`);
CREATE INDEX `idx_whoop_sleep_start` ON `whoop_sleep` (`start`);
CREATE INDEX `idx_whoop_sleep_user_id_start` ON `whoop_sleep` (`user_id`, `start`);
CREATE INDEX `idx_whoop_sleep_user_id_sleep_performance` ON `whoop_sleep` (`user_id`, `sleep_performance_percentage`);

CREATE INDEX `idx_whoop_body_measurement_user_id` ON `whoop_body_measurement` (`user_id`);
CREATE INDEX `idx_whoop_body_measurement_whoop_measurement_id` ON `whoop_body_measurement` (`whoop_measurement_id`);
CREATE INDEX `idx_whoop_body_measurement_measurement_date` ON `whoop_body_measurement` (`measurement_date`);
CREATE INDEX `idx_whoop_body_measurement_user_id_measurement_date` ON `whoop_body_measurement` (`user_id`, `measurement_date`);

CREATE INDEX `idx_rate_limit_user_id_endpoint` ON `rate_limit` (`user_id`, `endpoint`);
CREATE INDEX `idx_rate_limit_window_start` ON `rate_limit` (`window_start`);
