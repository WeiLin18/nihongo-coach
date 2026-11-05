CREATE TABLE `passages` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`topic` text NOT NULL,
	`draft` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `passages_created_idx` ON `passages` (`created_at`);