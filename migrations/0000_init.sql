CREATE TABLE `accents` (
	`surface` text NOT NULL,
	`reading` text NOT NULL,
	`accents` text NOT NULL,
	PRIMARY KEY(`surface`, `reading`)
);
--> statement-breakpoint
CREATE INDEX `accents_reading_idx` ON `accents` (`reading`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`source` text,
	`input` text NOT NULL,
	`ja` text NOT NULL,
	`category` text NOT NULL,
	`draft` text NOT NULL,
	`word_accents` text NOT NULL,
	`created_at` text NOT NULL,
	`due_at` text,
	`stability` real,
	`difficulty` real,
	`reps` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_category_idx` ON `cards` (`category`);--> statement-breakpoint
CREATE INDEX `cards_created_idx` ON `cards` (`created_at`);