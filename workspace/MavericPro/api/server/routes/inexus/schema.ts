import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  boolean,
  integer,
  real,
} from 'drizzle-orm/pg-core';

export const conversations = pgTable('inexus_conversations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New Conversation'),
  model: text('model').notNull().default('x-ai/grok-4-fast'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const messages = pgTable('inexus_messages', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  conversationId: varchar('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolName: text('tool_name'),
  toolResult: jsonb('tool_result'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const savedCredentials = pgTable('inexus_credentials', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  label: text('label').notNull(),
  siteUrl: text('site_url').notNull(),
  username: text('username').notNull(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const integrations = pgTable('inexus_integrations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  platform: text('platform').notNull(),
  label: text('label').notNull(),
  siteUrl: text('site_url').notNull(),
  username: text('username').notNull().default(''),
  password: text('password').notNull().default(''),
  notes: text('notes'),
  connected: boolean('connected').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentToolSettings = pgTable('inexus_tool_settings', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  toolId: text('tool_id').notNull(),
  enabled: boolean('enabled').notNull().default(true),
});

export const scheduledTasks = pgTable('inexus_scheduled_tasks', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed, cancelled
  nextRun: timestamp('next_run').notNull(),
  lastRun: timestamp('last_run'),
  lastResult: text('last_result'),
  model: text('model').notNull().default('google/gemini-2.5-flash'),
  notifyPhone: text('notify_phone'),
  scheduleType: text('schedule_type').notNull().default('once'), // once, recurring
  cronExpression: text('cron_expression'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const appSettings = pgTable(
  'inexus_settings',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    userKeyIdx: sql`UNIQUE(${table.userId}, ${table.key})`,
  }),
);

export const personas = pgTable('inexus_personas', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  character: text('character').notNull(),
  never: text('never').notNull(),
  avatarUrl: text('avatar_url'),
  gender: text('gender').default('Male'),
  language: text('language').default('English'),
  model: text('model').default('x-ai/grok-4-fast'),
  temperature: real('temperature').default(0.8),
  maxTokens: integer('max_tokens').default(4096),
  contextWindow: integer('context_window').default(20),
  unrestrictedMode: boolean('unrestricted_mode').default(false),
  memoryEnabled: boolean('memory_enabled').default(true),
  tone: text('tone').default('Neutral'),
  provider: text('provider').default('openrouter'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memories = pgTable('inexus_memories', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  personaId: varchar('persona_id').references(() => personas.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  importance: text('importance').default('medium'), // low, medium, high
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const skills = pgTable('inexus_skills', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  instructions: text('instructions').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Manual types for better control and to avoid drizzle-zod issues if any
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type SavedCredential = typeof savedCredentials.$inferSelect;
export type InsertCredential = typeof savedCredentials.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = typeof integrations.$inferInsert;
export type AgentToolSetting = typeof agentToolSettings.$inferSelect;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type InsertScheduledTask = typeof scheduledTasks.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type Persona = typeof personas.$inferSelect;
export type InsertPersona = typeof personas.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;
