import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const members = sqliteTable('members', {user: text('user').primaryKey(), name: text('name').notNull()});
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), user: text('user').notNull().references(() => members.user),
  body: text('body').notNull(), kind:text('kind').notNull(), created:integer('created').notNull()
}, t => [index('posts_created').on(t.created)]);
export const keys=sqliteTable('member_keys',{user:text('user').primaryKey().references(()=>members.user),hash:text('hash').notNull().unique()});
export const calendars=sqliteTable('calendars',{id:text('id').primaryKey(),blocks:text('blocks').notNull(),created:integer('created').notNull(),changed:integer('changed').notNull(),bucket:text('bucket').notNull()},t=>[index('calendar_bucket').on(t.bucket)]);
