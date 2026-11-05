CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`theme` text NOT NULL,
	`scenario` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `practice_sessions_created_idx` ON `practice_sessions` (`created_at`);--> statement-breakpoint
CREATE TABLE `practice_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`idx` integer NOT NULL,
	`text` text NOT NULL,
	`reply` text NOT NULL,
	`card_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_turns_session_idx` ON `practice_turns` (`session_id`,`idx`);