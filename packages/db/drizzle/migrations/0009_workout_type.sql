ALTER TABLE `workouts` ADD COLUMN `workout_type` text NOT NULL DEFAULT 'training';
--> statement-breakpoint
UPDATE `workouts` SET `workout_type` = 'one_rm_test' WHERE `name` = '1RM Test';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workouts_user_type_completed_at` ON `workouts` (`user_id`, `workout_type`, `completed_at`);
