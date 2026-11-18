CREATE TABLE `members` (
	`user` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `members`(`user`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posts_created` ON `posts` (`created`);