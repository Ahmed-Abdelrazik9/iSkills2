import express, { type Express } from 'express';
import path from 'path';
import * as fs from 'fs';
import { createServer, type Server } from 'http';
import twilioRouter from './twilio';
import { storage } from './storage';
import { WebSocket, WebSocketServer } from 'ws';
import { agentChat, agentChatDirect } from './agent';
import {
  waGetStatus,
  waSendMessage,
  waMakeVoiceCall,
  waInitialize,
  waSetOwnerPhone,
  waGetOwnerPhone,
} from './whatsapp';
import {
  setBridgeConfig,
  getBridgeConfig,
  startWhatsAppBridge,
  stopWhatsAppBridge,
  registerBridgeAgent,
} from './whatsapp-bridge';
import {
  browserNavigate,
  browserClick,
  browserType,
  browserKeyPress,
  browserScroll,
  browserBack,
  browserForward,
  browserRefresh,
  browserScreenshot,
  browserGetInfo,
  browserHover,
  browserClearInput,
  browserTypeFast,
  browserKeyPressFast,
  browserScrollFast,
  closeBrowser,
  preWarmBrowser,
  type BrowserState,
} from './browser';
import { addBrowserClient, removeBrowserClient, broadcastBrowserUpdate } from './browser-events';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export { broadcastBrowserUpdate };

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Pre-warm the browser in the background to ensure it's ready for the first request
  preWarmBrowser().catch((err) => console.error('[IneXus-Setup] Browser pre-warm error:', err));

  // Serve screenshots from the client images directory via Express
  const imagesDir = path.resolve(process.cwd(), 'client', 'public', 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  app.use('/images', express.static(imagesDir));

  app.get('/api/conversations', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversations = await storage.getConversations(userId);
    res.json(conversations);
  });

  app.post('/api/conversations', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversation = await storage.createConversation(userId, req.body);
    res.json(conversation);
  });

  app.get('/api/conversations/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversation = await storage.getConversation(userId, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Not found' });
    res.json(conversation);
  });

  app.get('/api/conversations/:id/messages', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversation = await storage.getConversation(userId, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Not found' });
    const messages = await storage.getMessages(req.params.id);
    res.json(messages);
  });

  app.delete('/api/conversations/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.deleteConversation(userId, req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/conversations/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.updateConversationTitle(userId, req.params.id, req.body.title);
    res.json({ success: true });
  });

  // PERSONAS
  app.get('/api/personas', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const personas = await storage.getPersonas(userId);
    res.json(personas);
  });

  app.post('/api/personas', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const persona = await storage.createPersona({ ...req.body, userId });
    res.json(persona);
  });

  app.patch('/api/personas/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const persona = await storage.updatePersona(req.params.id, userId, req.body);
    res.json(persona);
  });

  app.delete('/api/personas/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.deletePersona(req.params.id, userId);
    res.json({ success: true });
  });

  // MEMORIES
  app.get('/api/memories', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const memories = await storage.getMemories(userId);
    res.json(memories);
  });

  app.get('/api/personas/:id/memories', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const memories = await storage.getMemories(userId, req.params.id);
    res.json(memories);
  });

  app.post('/api/personas/:id/memories', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { content, importance } = req.body;
    try {
      const memory = await storage.createMemory(userId, {
        personaId: req.params.id,
        content,
        importance: importance || 'medium',
      });
      res.json(memory);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/memories/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.deleteMemory(req.params.id, userId);
    res.json({ success: true });
  });

  app.delete('/api/personas/:id/memories', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const memories = await storage.getMemories(userId, req.params.id);
      for (const m of memories) {
        await storage.deleteMemory(m.id, userId);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/credentials', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const credentials = await storage.getCredentials(userId);
    res.json(credentials);
  });

  app.post('/api/credentials', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { label, siteUrl, username, password } = req.body;
    if (!label?.trim() || !siteUrl?.trim() || !username?.trim() || !password?.trim()) {
      return res
        .status(400)
        .json({ error: 'All fields are required: label, siteUrl, username, password' });
    }
    await storage.deleteCredentialsByLabel(userId, label.trim());
    const credential = await storage.createCredential(userId, {
      label: label.trim(),
      siteUrl: siteUrl.trim(),
      username: username.trim(),
      password: password.trim(),
    });
    res.json(credential);
  });

  app.delete('/api/credentials/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.deleteCredential(userId, req.params.id);
    res.json({ success: true });
  });

  app.post('/api/inexus/browser/reset', async (req, res) => {
    try {
      await closeBrowser();
      broadcastBrowserUpdate({ screenshot: '', url: 'about:blank', title: 'Resetting...' });
      res.json({ success: true, message: 'Browser engine hard reset' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Data export endpoint — convert JSON array to CSV or JSON file download
  app.post('/api/export', (req, res) => {
    try {
      const { data, format = 'json', filename = 'export' } = req.body;
      if (!data) return res.status(400).json({ error: 'data is required' });

      let rows: Record<string, unknown>[];
      if (typeof data === 'string') {
        try {
          rows = JSON.parse(data);
        } catch {
          rows = [{ content: data }];
        }
      } else if (Array.isArray(data)) {
        rows = data;
      } else {
        rows = [data];
      }

      const safeName = filename.replace(/[^a-zA-Z0-9_\-]/g, '_');

      if (format === 'csv') {
        const headers = rows.length ? Object.keys(rows[0]) : ['data'];
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [
          headers.map(escape).join(','),
          ...rows.map((r) => headers.map((h) => escape((r as any)[h])).join(',')),
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
        return res.send(csv);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
        return res.send(JSON.stringify(rows, null, 2));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }); // ─── WhatsApp Routes ──────────────────────────────────────────────────────────

  // Register agentChatDirect with the WhatsApp bridge
  // registerBridgeAgent(agentChatDirect); // DEPRECATED

  // Twilio Native Webhook (WhatsApp Board)
  app.use('/api/inexus/twilio', twilioRouter);

  // General IneXus Settings (used by WhatsApp Board)
  app.post('/api/inexus/settings/:key', async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { key } = req.params;
    const { value } = req.body;
    try {
      await storage.setSetting(userId, key, String(value));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/inexus/settings/:key', async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { key } = req.params;
    try {
      const value = await storage.getSetting(userId, key);
      res.json({ key, value });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* 
  // DEPRECATED: Old Puppeteer-based WhatsApp Bridge
  const savedWaPhone = await storage.getSetting("whatsapp_owner_phone");
  const savedBridgeEnabled = await storage.getSetting("whatsapp_bridge_enabled");
  if (savedWaPhone) waSetOwnerPhone(savedWaPhone);
  if (savedBridgeEnabled === "true") {
    setBridgeConfig("1", savedWaPhone || "", true);
  }
  startWhatsAppBridge();
  */

  // Legacy WhatsApp routes removed in favor of WhatsApp Board
  /*
  app.get("/api/whatsapp/status", async (_req, res) => {
    try {
      const status = await waGetStatus();
      const bridgeCfg = getBridgeConfig();
      res.json({ ...status, bridge: bridgeCfg });
    } catch (err: any) {
      res.json({ status: "disconnected", qr: null, ownerPhone: "", bridge: { enabled: false } });
    }
  });

  app.post("/api/whatsapp/initialize", async (_req, res) => {
    try {
      await waInitialize();
      const status = await waGetStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/setup", async (req, res) => {
    try {
      const { ownerPhone, bridgeEnabled } = req.body;
      if (ownerPhone !== undefined) {
        await storage.setSetting("whatsapp_owner_phone", ownerPhone);
        waSetOwnerPhone(ownerPhone);
      }
      const enabled = bridgeEnabled !== undefined ? bridgeEnabled : getBridgeConfig().enabled;
      await storage.setSetting("whatsapp_bridge_enabled", String(enabled));
      setBridgeConfig("1", ownerPhone ?? waGetOwnerPhone(), enabled);
      if (enabled) {
        startWhatsAppBridge();
      } else {
        stopWhatsAppBridge();
      }
      res.json({ success: true, ownerPhone: ownerPhone ?? waGetOwnerPhone(), bridgeEnabled: enabled });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { phone, message } = req.body;
      if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
      const result = await waSendMessage(phone, message);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/voice-call", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "phone required" });
      const result = await waMakeVoiceCall(phone);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/refresh-qr", async (_req, res) => {
    try {
      const { waRefreshStatus } = await import("./whatsapp");
      const result = await waRefreshStatus();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  */

  let cachedModels: { id: string; name: string; provider: string; contextLength?: number }[] = [];
  let modelsCacheTime = 0;
  const MODELS_CACHE_TTL = 1000 * 60 * 60;

  app.get('/api/models', async (_req, res) => {
    const now = Date.now();
    if (cachedModels.length > 0 && now - modelsCacheTime < MODELS_CACHE_TTL) {
      return res.json(cachedModels);
    }
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!response.ok) throw new Error(`OpenRouter API ${response.status}`);
      const data = (await response.json()) as {
        data: Array<{ id: string; name: string; context_length?: number }>;
      };
      cachedModels = data.data
        .map((m) => {
          const provider = m.id.split('/')[0] || 'unknown';
          return {
            id: m.id,
            name: m.name || m.id.split('/').pop() || m.id,
            provider: provider.charAt(0).toUpperCase() + provider.slice(1),
            contextLength: m.context_length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      modelsCacheTime = now;
      res.json(cachedModels);
    } catch (err) {
      console.error('Failed to fetch OpenRouter models:', err);
      if (cachedModels.length > 0) return res.json(cachedModels);
      res.json([
        { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast', provider: 'x.AI' },
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
        { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
      ]);
    }
  });

  app.get('/api/integrations', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const items = await storage.getIntegrations(userId);
    res.json(items);
  });

  app.post('/api/integrations', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { platform, label, siteUrl, username, password, notes } = req.body;
    if (!platform || !label || !siteUrl) {
      return res.status(400).json({ error: 'platform, label, siteUrl are required' });
    }
    const item = await storage.createIntegration(userId, {
      platform,
      label,
      siteUrl,
      username: username || '',
      password: password || '',
      notes: notes || '',
      connected: false,
    });
    res.json(item);
  });

  app.patch('/api/integrations/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const item = await storage.updateIntegration(userId, req.params.id, req.body);
    res.json(item);
  });

  app.delete('/api/integrations/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.deleteIntegration(userId, req.params.id);
    res.json({ success: true });
  });

  app.post('/api/migrate-legacy-credentials', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (process.env.INEXUS_ENABLE_LEGACY_CREDENTIAL_MIGRATION !== 'true') {
      return res.status(403).json({
        error:
          'Legacy credential migration is disabled. Set INEXUS_ENABLE_LEGACY_CREDENTIAL_MIGRATION=true to enable it.',
      });
    }
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can migrate legacy credentials.' });
    }
    try {
      const result = await storage.migrateLegacyCredentials(userId);
      res.json({
        success: true,
        migrated: result,
        message: `Migrated ${result.credentials} credentials and ${result.integrations} integrations.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tool-settings', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const settings = await storage.getToolSettings(userId);
    res.json(settings);
  });

  app.post('/api/tool-settings/:toolId', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { enabled } = req.body;
    const setting = await storage.upsertToolSetting(userId, req.params.toolId, enabled);
    res.json(setting);
  });

  app.get('/api/scheduled-tasks', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const tasks = await storage.getScheduledTasks(userId);
    res.json(tasks);
  });

  app.delete('/api/scheduled-tasks/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.updateScheduledTask(userId, req.params.id, { status: 'cancelled' });
    res.json({ success: true });
  });

  // CUSTOM SKILLS
  app.get('/api/skills', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const skills = await storage.getSkills(userId);
    res.json(skills);
  });

  app.post('/api/skills', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const skill = await storage.createSkill(userId, req.body);
    res.json(skill);
  });

  app.patch('/api/skills/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const skill = await storage.updateSkill(req.params.id, userId, req.body);
    res.json(skill);
  });

  app.delete('/api/skills/:id', async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await storage.deleteSkill(req.params.id, userId);
    res.json({ success: true });
  });

  app.get('/api/image-proxy', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ message: 'Missing url parameter' });
    try {
      console.log(`[inexus-Image] Proxying image (TS): ${url}`);
      let referer = 'https://www.google.com/';
      try {
        const urlObj = new URL(url);
        referer = `${urlObj.protocol}//${urlObj.hostname}/`;
      } catch (e) {}

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'image/*',
          Referer: referer,
        },
      });
      if (!response.ok) return res.status(response.status).send('Image fetch failed');
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to proxy image: ${err.message}` });
    }
  });

  const ALLOWED_VOICES = new Set([
    'en-US-AvaNeural',
    'en-US-AndrewNeural',
    'en-US-JennyNeural',
    'en-US-GuyNeural',
    'en-GB-SoniaNeural',
    'en-GB-RyanNeural',
    'ar-EG-SalmaNeural',
    'ar-EG-ShakirNeural',
    'ar-SA-ZariyahNeural',
    'ar-SA-HamedNeural',
    'ar-JO-SanaNeural',
    'ar-JO-TaimNeural',
    'ar-KW-NouraNeural',
    'ar-KW-FahedNeural',
    'ar-LB-LaylaNeural',
    'ar-LB-RamiNeural',
    'ar-AE-FatimaNeural',
    'ar-AE-HamdanNeural',
    'ar-SY-AmanyNeural',
    'ar-SY-LaithNeural',
    'ar-IQ-RanaNeural',
    'ar-IQ-BasselNeural',
  ]);

  app.post('/api/tts', async (req, res) => {
    const { text, voice: reqVoice } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const trimmed = text.trim().slice(0, 5000);
    const voice =
      typeof reqVoice === 'string' && ALLOWED_VOICES.has(reqVoice) ? reqVoice : 'en-US-AvaNeural';

    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(trimmed);

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
        audioStream.on('end', () => resolve());
        audioStream.on('error', (err: Error) => reject(err));
      });
      const audioBuffer = Buffer.concat(chunks);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length.toString());
      res.send(audioBuffer);
    } catch (err: any) {
      console.error('TTS error:', err.message);
      res.status(500).json({ error: 'TTS generation failed' });
    }
  });

  class FakeWs {
    readyState = 1;
    output: string[] = [];
    send(data: string) {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'stream' && msg.content) this.output.push(msg.content);
      } catch {}
    }
  }

  async function sendWhatsAppNotification(
    phone: string,
    taskName: string,
    status: string,
    result: string,
  ) {
    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const summary = result.substring(0, 300).replace(/\n/g, ' ');
      const message = `🤖 Task "${taskName}" ${status}.\n\nResult: ${summary}`;
      const waUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
      await browserNavigate(waUrl);
      await new Promise((r) => setTimeout(r, 6000));
      await browserKeyPress('Enter');
      await new Promise((r) => setTimeout(r, 2000));
      console.log(`[Scheduler] WhatsApp notification sent to ${phone}`);
    } catch (err: any) {
      console.error(`[Scheduler] WhatsApp notification failed:`, err.message);
    }
  }

  async function runScheduledTask(taskId: string) {
    const task = await storage.getScheduledTask(taskId);
    if (!task || task.status !== 'pending') return;
    console.log(`[Scheduler] Running task: ${task.name}`);
    try {
      await storage.updateScheduledTask(taskId, { status: 'running', lastRun: new Date() });
      const fakeWs = new FakeWs() as any;
      const tempConvRes = await storage.createConversation(task.userId, {
        title: `Scheduled: ${task.name}`,
        model: task.model,
      });
      await agentChat(fakeWs, tempConvRes.id, task.description, task.model, [], null, task.userId);
      const result = fakeWs.output.join('').substring(0, 2000);
      if (task.scheduleType === 'recurring' && task.cronExpression) {
        const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await storage.updateScheduledTask(taskId, {
          status: 'pending',
          lastResult: result,
          nextRun,
        });
      } else {
        await storage.updateScheduledTask(taskId, { status: 'completed', lastResult: result });
      }
      console.log(`[Scheduler] Task "${task.name}" completed.`);
      if (task.notifyPhone) {
        await sendWhatsAppNotification(task.notifyPhone, task.name, 'completed ✅', result);
      }
    } catch (err: any) {
      console.error(`[Scheduler] Task "${task.name}" failed:`, err.message);
      await storage.updateScheduledTask(taskId, { status: 'failed', lastResult: err.message });
      if (task.notifyPhone) {
        await sendWhatsAppNotification(task.notifyPhone, task.name, 'failed ❌', err.message);
      }
    }
  }

  setInterval(async () => {
    try {
      const tasks = await storage.getPendingTasks();
      const now = new Date();
      for (const task of tasks) {
        if (new Date(task.nextRun) <= now) {
          runScheduledTask(task.id).catch(console.error);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Check error:', err);
    }
  }, 30000);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  let screenshotDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let actionQueue: Promise<any> = Promise.resolve();

  function debouncedScreenshot(delay = 250) {
    if (screenshotDebounceTimer) clearTimeout(screenshotDebounceTimer);
    screenshotDebounceTimer = setTimeout(async () => {
      try {
        const screenshot = await browserScreenshot();
        const info = await browserGetInfo();
        broadcastBrowserUpdate({ screenshot, ...info });
      } catch {}
    }, delay);
  }

  function queueAction<T>(fn: () => Promise<T>): Promise<T> {
    const p = actionQueue.then(fn, fn);
    actionQueue = p.then(
      () => {},
      () => {},
    );
    return p;
  }

  wss.on('connection', (ws: WebSocket, req: any) => {
    addBrowserClient(ws);

    ws.on('close', () => {
      (ws as any).stopRequested = true;
      removeBrowserClient(ws);
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'stop') {
          console.log(`[inexus-Routes] STOP signal received for conv: ${msg.conversationId}`);
          (ws as any).stopRequested = true;
          return;
        }

        if (msg.type === 'chat') {
          // DECISIVE RESET: Ensure any previous task on this connection is aborted
          if ((ws as any).stopRequested === false) {
            // If we are already running, signal stop first to be sure
            (ws as any).stopRequested = true;
            await new Promise((r) => setTimeout(r, 100));
          }
          (ws as any).stopRequested = false;
          // Store task generation metadata so stream_end can echo it back to detect stale signals
          (ws as any).__taskGen = msg.__gen;
          (ws as any).__taskAssistantMsgId = msg.assistantMsgId;
          (ws as any).__userMsgId = msg.userMsgId;
          (ws as any).__parentMessageId = msg.parentMessageId;
          (ws as any).__projectId = msg.projectId;

          await agentChat(
            ws,
            msg.conversationId,
            msg.content,
            msg.model,
            msg.files || [],
            msg.personaId || null,
            (req as any).user?.id,
            req,
            {
              userMsgId: msg.userMsgId,
              assistantMsgId: msg.assistantMsgId,
              parentMessageId: msg.parentMessageId,
              projectId: msg.projectId,
            },
          );
          return;
        }

        if (msg.type === 'stop') {
          (ws as any).stopRequested = true;
          return;
        }

        if (msg.type === 'reset') {
          console.log('[inexus-WS] Forced reset requested by client');
          (ws as any).stopRequested = true;
          await closeBrowser();
          broadcastBrowserUpdate({ screenshot: '', url: 'about:blank', title: 'Browser Reset' });
          ws.send(JSON.stringify({ type: 'browser_loading', loading: false }));
          return;
        }

        if (msg.type === 'browser_navigate') {
          ws.send(JSON.stringify({ type: 'browser_loading', loading: true }));
          const state = await queueAction(() => browserNavigate(msg.url));
          broadcastBrowserUpdate(state);
          ws.send(JSON.stringify({ type: 'browser_loading', loading: false }));
          return;
        }

        if (msg.type === 'browser_click') {
          const state = await queueAction(() => browserClick(msg.x, msg.y));
          broadcastBrowserUpdate(state);
          return;
        }

        if (msg.type === 'browser_type') {
          await queueAction(() => browserTypeFast(msg.text));
          debouncedScreenshot(300);
          return;
        }

        if (msg.type === 'browser_keypress') {
          const navKeys = ['Enter', 'Tab'];
          if (navKeys.includes(msg.key)) {
            const state = await queueAction(() => browserKeyPress(msg.key));
            broadcastBrowserUpdate(state);
          } else {
            await queueAction(() => browserKeyPressFast(msg.key));
            debouncedScreenshot(200);
          }
          return;
        }

        if (msg.type === 'browser_scroll') {
          await queueAction(() => browserScrollFast(msg.deltaX || 0, msg.deltaY || 0));
          debouncedScreenshot(200);
          return;
        }

        if (msg.type === 'browser_back') {
          ws.send(JSON.stringify({ type: 'browser_loading', loading: true }));
          const state = await queueAction(() => browserBack());
          broadcastBrowserUpdate(state);
          ws.send(JSON.stringify({ type: 'browser_loading', loading: false }));
          return;
        }

        if (msg.type === 'browser_forward') {
          ws.send(JSON.stringify({ type: 'browser_loading', loading: true }));
          const state = await queueAction(() => browserForward());
          broadcastBrowserUpdate(state);
          ws.send(JSON.stringify({ type: 'browser_loading', loading: false }));
          return;
        }

        if (msg.type === 'browser_refresh') {
          ws.send(JSON.stringify({ type: 'browser_loading', loading: true }));
          const state = await queueAction(() => browserRefresh());
          broadcastBrowserUpdate(state);
          ws.send(JSON.stringify({ type: 'browser_loading', loading: false }));
          return;
        }

        if (msg.type === 'browser_screenshot') {
          const screenshot = await browserScreenshot();
          const info = await browserGetInfo();
          ws.send(JSON.stringify({ type: 'browser_update', screenshot, ...info }));
          return;
        }

        if (msg.type === 'browser_hover') {
          const state = await queueAction(() => browserHover(msg.x, msg.y));
          broadcastBrowserUpdate(state);
          return;
        }

        if (msg.type === 'browser_clear_input') {
          const state = await queueAction(() => browserClearInput());
          broadcastBrowserUpdate(state);
          return;
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', content: err.message }));
      }
    });
  });

  return httpServer;
}
