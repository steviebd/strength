CREATE UNIQUE INDEX `exercises_user_id_library_id_unique` ON `exercises` (`user_id`, `library_id`);
CREATE UNIQUE INDEX `user_integration_user_id_provider_unique` ON `user_integration` (`user_id`, `provider`);
CREATE UNIQUE INDEX `user_integration_provider_provider_user_id_unique` ON `user_integration` (`provider`, `provider_user_id`);
CREATE UNIQUE INDEX `nutrition_training_context_user_id_unique` ON `nutrition_training_context` (`user_id`);
