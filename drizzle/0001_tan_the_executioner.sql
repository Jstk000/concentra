CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`blocks` text NOT NULL,
	`created` integer NOT NULL,
	`changed` integer NOT NULL,
	`bucket` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_bucket` ON `calendars` (`bucket`);--> statement-breakpoint
CREATE TABLE `member_keys` (
	`user` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `members`(`user`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_keys_hash_unique` ON `member_keys` (`hash`);