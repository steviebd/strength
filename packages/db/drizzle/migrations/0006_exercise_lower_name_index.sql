CREATE INDEX `idx_exercises_user_deleted_lower_name` ON `exercises` (`user_id`, `is_deleted`, lower(`name`));
