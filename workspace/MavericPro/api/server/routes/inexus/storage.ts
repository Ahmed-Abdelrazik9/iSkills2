import { eq, desc, ilike, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  conversations,
  messages,
  savedCredentials,
  integrations,
  agentToolSettings,
  scheduledTasks,
  appSettings,
  personas,
  memories,
  skills,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type SavedCredential,
  type InsertCredential,
  type Integration,
  type InsertIntegration,
  type AgentToolSetting,
  type ScheduledTask,
  type InsertScheduledTask,
  type Persona,
  type InsertPersona,
  type Memory,
  type InsertMemory,
  type Skill,
  type InsertSkill,
} from './schema';

export interface IStorage {
  createConversation(
    userId: string | undefined | Partial<InsertConversation>,
    data?: Partial<InsertConversation>,
  ): Promise<Conversation>;
  getConversations(userId?: string): Promise<Conversation[]>;
  getConversation(userId: string | undefined, id?: string): Promise<Conversation | undefined>;
  deleteConversation(userId: string | undefined, id?: string): Promise<void>;
  deleteAllConversations(userId?: string | undefined): Promise<void>;
  updateConversationTitle(
    userId: string | undefined,
    id: string | undefined,
    title?: string,
  ): Promise<void>;
  createMessage(data: InsertMessage): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  updateMessageContent(id: string, content: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  createCredential(
    userId: string | undefined | Partial<InsertCredential>,
    data?: Partial<InsertCredential>,
  ): Promise<SavedCredential>;
  getCredentials(userId?: string): Promise<SavedCredential[]>;
  deleteCredential(userId: string | undefined, id?: string): Promise<void>;
  deleteCredentialsByLabel(userId: string | undefined, label?: string): Promise<void>;
  migrateLegacyCredentials(userId: string): Promise<{ credentials: number; integrations: number }>;
  createIntegration(
    userId: string | undefined | Partial<InsertIntegration>,
    data?: Partial<InsertIntegration>,
  ): Promise<Integration>;
  getIntegrations(userId?: string): Promise<Integration[]>;
  getIntegration(userId: string | undefined, id?: string): Promise<Integration | undefined>;
  updateIntegration(
    userId: string | undefined | Partial<InsertIntegration>,
    id?: string | Partial<InsertIntegration>,
    data?: Partial<InsertIntegration>,
  ): Promise<Integration>;
  deleteIntegration(userId: string | undefined, id?: string): Promise<void>;
  getToolSettings(userId?: string): Promise<AgentToolSetting[]>;
  upsertToolSetting(
    userId: string | undefined,
    toolId: string | boolean,
    enabled?: boolean,
  ): Promise<AgentToolSetting>;
  getEnabledTools(userId?: string): Promise<string[]>;
  createScheduledTask(
    userId: string | undefined | Partial<InsertScheduledTask>,
    data?: Partial<InsertScheduledTask>,
  ): Promise<ScheduledTask>;
  getScheduledTasks(userId?: string): Promise<ScheduledTask[]>;
  getScheduledTask(userId: string | undefined, id?: string): Promise<ScheduledTask | undefined>;
  updateScheduledTask(
    userId: string | undefined | Partial<ScheduledTask>,
    id?: string | Partial<ScheduledTask>,
    data?: Partial<ScheduledTask>,
  ): Promise<ScheduledTask>;
  deleteScheduledTask(userId: string | undefined, id?: string): Promise<void>;
  getPendingTasks(): Promise<ScheduledTask[]>;
  getSetting(userId: string | undefined, key?: string): Promise<string | null>;
  setSetting(userId: string | undefined, key: string | undefined, value?: string): Promise<void>;
  // Persona & Memory methods
  getPersona(userId: string | undefined, id: string): Promise<Persona | undefined>;
  getPersonas(userId: string | undefined): Promise<Persona[]>;
  createPersona(data: InsertPersona): Promise<Persona>;
  updatePersona(id: string, userId: string, data: Partial<InsertPersona>): Promise<Persona>;
  deletePersona(id: string, userId: string): Promise<void>;
  createMemory(userId: string, data: Partial<InsertMemory>): Promise<Memory>;
  getMemories(userId: string, personaId?: string | null): Promise<Memory[]>;
  deleteMemory(id: string, userId: string): Promise<void>;
  // Skill methods
  getSkills(userId: string): Promise<Skill[]>;
  createSkill(userId: string, data: InsertSkill): Promise<Skill>;
  updateSkill(id: string, userId: string, data: Partial<InsertSkill>): Promise<Skill>;
  deleteSkill(id: string, userId: string): Promise<void>;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export class DatabaseStorage implements IStorage {
  async initialize(): Promise<void> {
    const rawClient = await pool.connect();
    try {
      await rawClient.query(`
        CREATE TABLE IF NOT EXISTS inexus_conversations (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT 'New Conversation',
          model TEXT NOT NULL DEFAULT 'x-ai/grok-4-fast',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_messages (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          conversation_id TEXT NOT NULL REFERENCES inexus_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_name TEXT,
          tool_result JSONB,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_credentials (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          label TEXT NOT NULL,
          site_url TEXT NOT NULL,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_integrations (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          label TEXT NOT NULL,
          site_url TEXT NOT NULL,
          username TEXT NOT NULL DEFAULT '',
          password TEXT NOT NULL DEFAULT '',
          notes TEXT,
          connected BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_tool_settings (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          tool_id TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true
        );
        CREATE TABLE IF NOT EXISTS inexus_scheduled_tasks (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          next_run TIMESTAMP WITH TIME ZONE NOT NULL,
          last_run TIMESTAMP WITH TIME ZONE,
          last_result TEXT,
          model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
          notify_phone TEXT,
          schedule_type TEXT NOT NULL DEFAULT 'once',
          cron_expression TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_settings (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          UNIQUE(user_id, key)
        );
        CREATE TABLE IF NOT EXISTS inexus_personas (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          character TEXT NOT NULL,
          never TEXT NOT NULL,
          avatar_url TEXT,
          gender TEXT DEFAULT 'Male',
          language TEXT DEFAULT 'English',
          model TEXT DEFAULT 'x-ai/grok-4-fast',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_memories (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          persona_id TEXT REFERENCES inexus_personas(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          importance TEXT DEFAULT 'medium',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inexus_skills (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          instructions TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
      `);

      await rawClient.query(`
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS temperature REAL DEFAULT 0.8;
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 4096;
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS context_window INTEGER DEFAULT 20;
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS unrestricted_mode BOOLEAN DEFAULT FALSE;
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'Neutral';
        ALTER TABLE inexus_personas ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'openrouter';

        ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
        ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
        ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '';
        ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS tool TEXT DEFAULT 'none';
        ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
      `);

      console.log('[iNexus Storage] Tables initialized successfully');
    } catch (err: any) {
      console.error('[iNexus Storage] Initialization error:', err.message);
    } finally {
      rawClient.release();
    }
  }

  async createConversation(userIdOrData: any, data?: any): Promise<Conversation> {
    const userId = typeof userIdOrData === 'string' ? userIdOrData : undefined;
    if (!userId) throw new Error('userId is required to create a conversation');
    const finalData = typeof userIdOrData === 'string' ? data : userIdOrData;
    const [conv] = await db
      .insert(conversations)
      .values({
        userId,
        title: finalData.title || 'New Conversation',
        model: finalData.model || 'x-ai/grok-4-fast',
      } as any)
      .returning();
    return conv;
  }

  async getConversations(userId?: string): Promise<Conversation[]> {
    if (userId)
      return db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.createdAt));
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async getConversation(userIdOrId: any, id?: string): Promise<Conversation | undefined> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(conversations.id, finalId), eq(conversations.userId, userId))
      : eq(conversations.id, finalId);
    const [conv] = await db.select().from(conversations).where(condition);
    return conv;
  }

  async upsertConversation(
    userId: string,
    id: string,
    data: Partial<InsertConversation> = {},
  ): Promise<Conversation> {
    const { title = 'New Conversation', model = 'x-ai/grok-4-fast' } = data;
    const values = { id, userId, title, model };
    const [conv] = await db
      .insert(conversations)
      .values(values)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          title: sql`CASE WHEN inexus_conversations.title = 'New Conversation' THEN EXCLUDED.title ELSE inexus_conversations.title END`,
          model: sql`EXCLUDED.model`,
        },
      })
      .returning();
    return conv as unknown as Conversation;
  }

  async deleteConversation(userIdOrId: any, id?: string): Promise<void> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(conversations.id, finalId), eq(conversations.userId, userId))
      : eq(conversations.id, finalId);
    await db.delete(conversations).where(condition);
  }

  async deleteAllConversations(userId?: string): Promise<void> {
    const condition = userId ? eq(conversations.userId, userId) : sql`true`;
    await db.delete(conversations).where(condition);
  }

  async updateConversationTitle(userIdOrId: any, idOrTitle: any, title?: string): Promise<void> {
    const userId = title ? userIdOrId : undefined;
    const finalId = title ? idOrTitle : userIdOrId;
    const finalTitle = title ? title : idOrTitle;
    const condition = userId
      ? and(eq(conversations.id, finalId), eq(conversations.userId, userId))
      : eq(conversations.id, finalId);
    await db.update(conversations).set({ title: finalTitle }).where(condition);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }
  async getMessages(conversationId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }
  async getMessage(id: string): Promise<Message | undefined> {
    const [msg] = await db.select().from(messages).where(eq(messages.id, id));
    return msg;
  }
  async updateMessageContent(id: string, content: string): Promise<void> {
    await db.update(messages).set({ content }).where(eq(messages.id, id));
  }
  async deleteMessage(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async createCredential(userIdOrData: any, data?: any): Promise<SavedCredential> {
    const userId = typeof userIdOrData === 'string' ? userIdOrData : undefined;
    if (!userId) throw new Error('userId is required to create a credential');
    const finalData = typeof userIdOrData === 'string' ? data : userIdOrData;
    const [cred] = await db
      .insert(savedCredentials)
      .values({ ...finalData, userId } as any)
      .returning();
    return cred;
  }
  async getCredentials(userId?: string): Promise<SavedCredential[]> {
    if (userId)
      return db
        .select()
        .from(savedCredentials)
        .where(eq(savedCredentials.userId, userId))
        .orderBy(desc(savedCredentials.createdAt));
    return db.select().from(savedCredentials).orderBy(desc(savedCredentials.createdAt));
  }
  async deleteCredential(userIdOrId: any, id?: string): Promise<void> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(savedCredentials.id, finalId), eq(savedCredentials.userId, userId))
      : eq(savedCredentials.id, finalId);
    await db.delete(savedCredentials).where(condition);
  }
  async deleteCredentialsByLabel(userIdOrLabel: any, label?: string): Promise<void> {
    const userId = label ? userIdOrLabel : undefined;
    const finalLabel = label ? label : userIdOrLabel;
    const condition = userId
      ? and(ilike(savedCredentials.label, finalLabel), eq(savedCredentials.userId, userId))
      : ilike(savedCredentials.label, finalLabel);
    await db.delete(savedCredentials).where(condition);
  }

  async migrateLegacyCredentials(userId: string): Promise<{ credentials: number; integrations: number }> {
    // Move any rows that were saved under the pre-scoping placeholder user into the
    // authenticated user's scope. The operation is wrapped in a transaction and guarded
    // by an advisory lock so concurrent migration calls cannot duplicate the same legacy
    // rows across different users. Only call this endpoint when the caller is confident
    // the legacy rows belong to them (typical single-user / self-hosted deployments).
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(123456)`);
      const legacyCredentials = await tx
        .select()
        .from(savedCredentials)
        .where(eq(savedCredentials.userId, 'default-user'));
      const legacyIntegrations = await tx
        .select()
        .from(integrations)
        .where(eq(integrations.userId, 'default-user'));
      for (const c of legacyCredentials) {
        await tx.insert(savedCredentials).values({ ...c, id: undefined, userId } as any);
      }
      for (const i of legacyIntegrations) {
        await tx.insert(integrations).values({ ...i, id: undefined, userId } as any);
      }
      await tx.delete(savedCredentials).where(eq(savedCredentials.userId, 'default-user'));
      await tx.delete(integrations).where(eq(integrations.userId, 'default-user'));
      return { credentials: legacyCredentials.length, integrations: legacyIntegrations.length };
    });
  }

  async createIntegration(userIdOrData: any, data?: any): Promise<Integration> {
    const userId = typeof userIdOrData === 'string' ? userIdOrData : undefined;
    if (!userId) throw new Error('userId is required to create an integration');
    const finalData = typeof userIdOrData === 'string' ? data : userIdOrData;
    const [item] = await db
      .insert(integrations)
      .values({ ...finalData, userId } as any)
      .returning();
    return item;
  }
  async getIntegrations(userId?: string): Promise<Integration[]> {
    if (userId)
      return db
        .select()
        .from(integrations)
        .where(eq(integrations.userId, userId))
        .orderBy(desc(integrations.createdAt));
    return db.select().from(integrations).orderBy(desc(integrations.createdAt));
  }
  async getIntegration(userIdOrId: any, id?: string): Promise<Integration | undefined> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(integrations.id, finalId), eq(integrations.userId, userId))
      : eq(integrations.id, finalId);
    const [item] = await db.select().from(integrations).where(condition);
    return item;
  }
  async updateIntegration(userIdOrId: any, idOrData: any, data?: any): Promise<Integration> {
    const userId = data ? userIdOrId : undefined;
    const finalId = data ? idOrData : userIdOrId;
    const finalData = data ? data : idOrData;
    const condition = userId
      ? and(eq(integrations.id, finalId), eq(integrations.userId, userId))
      : eq(integrations.id, finalId);
    const [item] = await db.update(integrations).set(finalData).where(condition).returning();
    return item;
  }
  async deleteIntegration(userIdOrId: any, id?: string): Promise<void> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(integrations.id, finalId), eq(integrations.userId, userId))
      : eq(integrations.id, finalId);
    await db.delete(integrations).where(condition);
  }

  async getToolSettings(userId?: string): Promise<AgentToolSetting[]> {
    if (userId)
      return db.select().from(agentToolSettings).where(eq(agentToolSettings.userId, userId));
    return db.select().from(agentToolSettings);
  }
  async upsertToolSetting(
    userIdOrToolId: any,
    toolIdOrEnabled: any,
    enabled?: boolean,
  ): Promise<AgentToolSetting> {
    const userId = enabled !== undefined ? userIdOrToolId : undefined;
    if (!userId) throw new Error('userId is required to upsert a tool setting');
    const finalToolId = enabled !== undefined ? toolIdOrEnabled : userIdOrToolId;
    const finalEnabled = enabled !== undefined ? enabled : toolIdOrEnabled;
    const existing = await db
      .select()
      .from(agentToolSettings)
      .where(and(eq(agentToolSettings.toolId, finalToolId), eq(agentToolSettings.userId, userId)));
    if (existing.length > 0) {
      const [updated] = await db
        .update(agentToolSettings)
        .set({ enabled: finalEnabled })
        .where(and(eq(agentToolSettings.toolId, finalToolId), eq(agentToolSettings.userId, userId)))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(agentToolSettings)
        .values({ userId, toolId: finalToolId, enabled: finalEnabled })
        .returning();
      return created;
    }
  }
  async getEnabledTools(userId?: string): Promise<string[]> {
    if (!userId) throw new Error('userId is required to get enabled tools');
    const uId = userId;
    const settings = await db
      .select()
      .from(agentToolSettings)
      .where(and(eq(agentToolSettings.enabled, false), eq(agentToolSettings.userId, uId)));
    const disabledTools = new Set(settings.map((s) => s.toolId));
    return ALL_TOOL_IDS.filter((id) => !disabledTools.has(id));
  }

  async createScheduledTask(userIdOrData: any, data?: any): Promise<ScheduledTask> {
    const userId = typeof userIdOrData === 'string' ? userIdOrData : undefined;
    if (!userId) throw new Error('userId is required to create a scheduled task');
    const finalData = typeof userIdOrData === 'string' ? data : userIdOrData;
    const [task] = await db
      .insert(scheduledTasks)
      .values({ ...finalData, userId } as any)
      .returning();
    return task;
  }
  async getScheduledTasks(userId?: string): Promise<ScheduledTask[]> {
    if (userId)
      return db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.userId, userId))
        .orderBy(desc(scheduledTasks.createdAt));
    return db.select().from(scheduledTasks).orderBy(desc(scheduledTasks.createdAt));
  }
  async getScheduledTask(userIdOrId: any, id?: string): Promise<ScheduledTask | undefined> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(scheduledTasks.id, finalId), eq(scheduledTasks.userId, userId))
      : eq(scheduledTasks.id, finalId);
    const [task] = await db.select().from(scheduledTasks).where(condition);
    return task;
  }
  async updateScheduledTask(userIdOrId: any, idOrData: any, data?: any): Promise<ScheduledTask> {
    const userId = data ? userIdOrId : undefined;
    const finalId = data ? idOrData : userIdOrId;
    const finalData = data ? data : idOrData;
    const condition = userId
      ? and(eq(scheduledTasks.id, finalId), eq(scheduledTasks.userId, userId))
      : eq(scheduledTasks.id, finalId);
    const [task] = await db.update(scheduledTasks).set(finalData).where(condition).returning();
    return task;
  }
  async deleteScheduledTask(userIdOrId: any, id?: string): Promise<void> {
    const userId = id ? userIdOrId : undefined;
    const finalId = id ? id : userIdOrId;
    const condition = userId
      ? and(eq(scheduledTasks.id, finalId), eq(scheduledTasks.userId, userId))
      : eq(scheduledTasks.id, finalId);
    await db.delete(scheduledTasks).where(condition);
  }
  async getPendingTasks(): Promise<ScheduledTask[]> {
    return db.select().from(scheduledTasks).where(eq(scheduledTasks.status, 'pending'));
  }

  async getSetting(userIdOrKey: any, key?: string): Promise<string | null> {
    const userId = key ? userIdOrKey : undefined;
    if (!userId) throw new Error('userId is required to get a setting');
    const finalKey = key ? key : userIdOrKey;
    try {
      const [row] = await db
        .select()
        .from(appSettings)
        .where(and(eq(appSettings.key, finalKey), eq(appSettings.userId, userId)));
      return row?.value ?? null;
    } catch {
      return null;
    }
  }
  async setSetting(userIdOrKey: any, keyOrValue: any, value?: string): Promise<void> {
    const userId = value !== undefined ? userIdOrKey : undefined;
    if (!userId) throw new Error('userId is required to set a setting');
    const finalKey = value !== undefined ? keyOrValue : userIdOrKey;
    const finalValue = value !== undefined ? value : keyOrValue;
    await db
      .insert(appSettings)
      .values({ userId, key: finalKey, value: finalValue })
      .onConflictDoUpdate({
        target: [appSettings.userId, appSettings.key] as any,
        set: { value: finalValue },
      });
  }

  // Persona & Memory Implementation
  async getPersona(userId: string | undefined, id: string): Promise<Persona | undefined> {
    const condition = userId
      ? and(eq(personas.id, id), eq(personas.userId, userId))
      : eq(personas.id, id);
    const [row] = await db.select().from(personas).where(condition);
    return row;
  }

  async getPersonas(userId: string | undefined): Promise<Persona[]> {
    if (userId)
      return db
        .select()
        .from(personas)
        .where(eq(personas.userId, userId))
        .orderBy(desc(personas.createdAt));
    return db.select().from(personas).orderBy(desc(personas.createdAt));
  }

  async createMemory(userId: string, data: Partial<InsertMemory>): Promise<Memory> {
    const [row] = await db
      .insert(memories)
      .values({ ...data, userId } as any)
      .returning();
    return row;
  }

  async getMemories(userId: string, personaId: string | null = null): Promise<Memory[]> {
    const condition = personaId
      ? and(eq(memories.userId, userId), eq(memories.personaId, personaId))
      : and(eq(memories.userId, userId), sql`${memories.personaId} IS NULL`);
    return db.select().from(memories).where(condition).orderBy(desc(memories.createdAt));
  }

  async createPersona(data: InsertPersona): Promise<Persona> {
    const [row] = await db
      .insert(personas)
      .values(data as any)
      .returning();
    return row;
  }

  async updatePersona(id: string, userId: string, data: Partial<InsertPersona>): Promise<Persona> {
    const [row] = await db
      .update(personas)
      .set(data)
      .where(and(eq(personas.id, id), eq(personas.userId, userId)))
      .returning();
    return row;
  }

  async deletePersona(id: string, userId: string): Promise<void> {
    await db.delete(personas).where(and(eq(personas.id, id), eq(personas.userId, userId)));
  }

  async deleteMemory(id: string, userId: string): Promise<void> {
    await db.delete(memories).where(and(eq(memories.id, id), eq(memories.userId, userId)));
  }

  // Skill Implementation
  async getSkills(userId: string): Promise<Skill[]> {
    return db
      .select()
      .from(skills)
      .where(eq(skills.userId, userId))
      .orderBy(desc(skills.createdAt));
  }

  async createSkill(userId: string, data: InsertSkill): Promise<Skill> {
    const [row] = await db
      .insert(skills)
      .values({ ...data, userId } as any)
      .returning();
    return row;
  }

  async updateSkill(id: string, userId: string, data: Partial<InsertSkill>): Promise<Skill> {
    const [row] = await db
      .update(skills)
      .set(data)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)))
      .returning();
    return row;
  }

  async deleteSkill(id: string, userId: string): Promise<void> {
    await db.delete(skills).where(and(eq(skills.id, id), eq(skills.userId, userId)));
  }
}

export const ALL_TOOL_IDS = [
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_press_key',
  'browser_scroll',
  'browser_read_page',
  'browser_get_elements',
  'browser_clear_input',
  'browser_hover',
  'bg_navigate',
  'bg_click',
  'bg_type',
  'bg_press_key',
  'bg_scroll',
  'bg_clear_input',
  'bg_read_page',
  'bg_get_elements',
  'search_web',
  'search_images',
  'get_credentials',
  'create_pdf',
  'create_report',
  'extract_table_data',
  'download_media',
  'take_full_screenshot',
  'execute_js_in_browser',
  'create_powerpoint',
  'generate_ai_image',
  'run_python_code',
  'send_whatsapp_message',
  'post_to_instagram',
  'read_gmail_inbox',
  'manage_calendar',
  'post_to_facebook',
  'post_to_tiktok',
  'send_email_gmail',
  'send_email_icloud',
  'search_social_media',
  'search_email',
  'schedule_task',
  'list_scheduled_tasks',
  'cancel_scheduled_task',
];

export const storage = new DatabaseStorage();
storage.initialize().catch((err) => console.error('Storage init failed:', err));
