ALTER TABLE `passages` ADD `source` text;--> statement-breakpoint
ALTER TABLE `passages` ADD `prepared_for` text;--> statement-breakpoint
ALTER TABLE `passages` ADD `daily_key` text;--> statement-breakpoint
ALTER TABLE `passages` ADD `opened_at` text;--> statement-breakpoint
ALTER TABLE `passages` ADD `source_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `passages_daily_key_idx` ON `passages` (`daily_key`);--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `source` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `prepared_for` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `daily_key` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `opened_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `practice_sessions_daily_key_idx` ON `practice_sessions` (`daily_key`);