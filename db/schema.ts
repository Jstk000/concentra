import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const members = sqliteTable('members', {user: text('user').primaryKey(), name: text('name').notNull()});
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), user: text('user').notNull().references(() => members.user),
  body: text('body').notNull(), kind:text('kind').notNull(), created:integer('created').notNull()
}, t => [index('posts_created').on(t.created)]);
