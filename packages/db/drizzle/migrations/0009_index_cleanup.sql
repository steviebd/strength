CREATE INDEX IF NOT EXISTS `idx_workouts_user_deleted_started_at` ON `workouts` (`user_id`, `is_deleted`, `started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workouts_user_deleted_completed_at` ON `workouts` (`user_id`, `is_deleted`, `completed_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_templates_user_deleted_created_at` ON `templates` (`user_id`, `is_deleted`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exercises_user_deleted_created_at` ON `exercises` (`user_id`, `is_deleted`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workout_sets_exercise_set_number` ON `workout_sets` (`workout_exercise_id`, `set_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_program_cycles_user_status_started_at` ON `user_program_cycles` (`user_id`, `status`, `started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_program_cycle_workouts_cycle_order` ON `program_cycle_workouts` (`cycle_id`, `week_number`, `session_number`);
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_templates_user_id_updated_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_workouts_user_id_started_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_workouts_user_id_completed_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_workouts_completed_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_workout_sets_workout_exercise_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_workout_sets_completed_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_user_program_cycles_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_program_cycle_workouts_cycle_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_template_exercises_template_id`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_template_exercises_template_id` ON `template_exercises` (`template_id`, `order_index`);
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_user_integration_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_user_integration_provider`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_user_integration_user_id_provider`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_profile_whoop_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_workout_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_workout_whoop_workout_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_workout_start`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_recovery_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_recovery_whoop_recovery_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_recovery_date`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_cycle_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_cycle_whoop_cycle_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_cycle_start`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_cycle_day_strain`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_sleep_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_sleep_whoop_sleep_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_sleep_start`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_body_measurement_user_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_body_measurement_whoop_measurement_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_whoop_body_measurement_measurement_date`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_rate_limit_user_id_endpoint`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_user_body_stats_user`;
--> statement-breakpoint
DROP INDEX IF EXISTS `session_user_id_idx`;
