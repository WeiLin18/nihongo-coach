DROP INDEX `practice_turns_session_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `practice_turns_session_idx` ON `practice_turns` (`session_id`,`idx`);