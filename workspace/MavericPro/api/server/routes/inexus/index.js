/**
 * inexus Routes + WebSocket handler
 *
 * SECURITY: All routes require JWT authentication.
 * Every storage call is scoped to req.user.id — users can NEVER
 * access each other's conversations, personas, credentials or memories.
 */
console.log('[inexus-System] Routes file loaded');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { storage } = require('./storage');
const { agentChat, agentChatDirect } = require('./agent');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const {
  browserNavigate,
  browserClick,
  browserType,
  browserKeyPress,
  browserScroll,
  browserClearInput,
  browserHover,
  browserGetInfo,
  browserBack,
  browserForward,
  browserRefresh,
  browserGetPageContent,
  browserGetClickableElements,
  browserDismissOverlays,
} = require('./browser');
const { addBrowserEventClient } = require('./browser-events');

const {
  waGetStatus,
  waSendMessage,
  waMakeVoiceCall,
  waInitialize,
  waSetOwnerPhone,
  waGetOwnerPhone,
} = require('./whatsapp');
const {
  setBridgeConfig,
  getBridgeConfig,
  startWhatsAppBridge,
  stopWhatsAppBridge,
  registerBridgeAgent,
} = require('./whatsapp-bridge');

// Register the agent for WhatsApp Bridge
registerBridgeAgent(agentChatDirect);

const MsEdgeTTS = require('msedge-tts').MsEdgeTTS;
const OUTPUT_FORMAT = require('msedge-tts').OUTPUT_FORMAT;

const { logger } = require('@librechat/data-schemas');
const twilioRouter = require('./twilio');
const router = express.Router();

// Enforce JWT authentication on ALL inexus API routes EXCEPT image-proxy and browser/reset
router.use((req, res, next) => {
  if (req.path === '/image-proxy' || req.path === '/browser/reset') {
    // Skip JWT auth for image proxy and browser reset
    return next();
  }
  return requireJwtAuth(req, res, next);
});

// ── Conversations ────────────────────────────────────────────────────────────

router.get('/conversations', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const conversations = await storage.getConversations(uid);
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/conversations', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  console.log(`[inexus-API] POST /conversations - User: ${uid}, Body:`, JSON.stringify(req.body));
  try {
    const conversation = await storage.createConversation(uid, req.body);
    console.log(`[inexus-API] Conversation created successfully: ${conversation.id}`);
    res.json(conversation);
  } catch (err) {
    console.error(`[inexus-API] Error creating conversation:`, err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/conversations/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const conv = await storage.getConversation(uid, req.params.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/conversations', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.deleteAllConversations(uid);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/conversations/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.deleteConversation(uid, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/conversations/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }
    await storage.updateConversationTitle(uid, req.params.id, title.trim());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const conv = await storage.getConversation(uid, req.params.id);
    if (!conv) return res.status(403).json({ error: 'Access denied' });
    const messages = await storage.getMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/conversations/:id/messages/:msgId', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const { id, msgId } = req.params;
    const conv = await storage.getConversation(uid, id);
    if (!conv) return res.status(403).json({ error: 'Access denied' });

    const msg = (await storage.getMessages(id)).find((m) => m.id === msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    if (req.query.after === 'true') {
      await storage.deleteMessagesAfter(id, msg.createdAt);
    } else {
      await storage.deleteMessage(msgId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/messages/:id', async (req, res) => {
  try {
    const uid = req.user.id || req.user._id?.toString();
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }
    const message = await storage.getMessage(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    const conversation = await storage.getConversation(uid, message.conversationId);
    if (!conversation) return res.status(403).json({ error: 'Forbidden' });
    await storage.updateMessageContent(req.params.id, content.trim());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Personas ─────────────────────────────────────────────────────────────────

router.get('/personas', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  console.log(`[inexus-API] Fetching personas for UID: ${uid}`);
  try {
    const personas = await storage.getPersonas(uid);
    console.log(`[inexus-API] Found ${personas.length} personas for UID: ${uid}`);
    res.json(personas);
  } catch (err) {
    console.error(`[inexus-API] Error fetching personas for UID ${uid}:`, err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/personas', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const persona = await storage.createPersona(uid, req.body);
    res.json(persona);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/personas/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const persona = await storage.updatePersona(uid, req.params.id, req.body);
    res.json(persona);

    // Auto-regenerate voice twin in background (non-blocking)
    if (persona && !persona.isVoiceVariant) {
      const existingTwin = await storage.findVoiceTwinBySource(uid, req.params.id);
      if (existingTwin) {
        _generateVoiceCharacter(persona)
          .then(async (voiceCharacter) => {
            if (voiceCharacter) {
              await storage.updateVoiceTwinCharacter(uid, existingTwin.id, voiceCharacter);
              console.log(`[inexus-API] Voice twin auto-regenerated for persona: ${persona.name}`);
            }
          })
          .catch((e) => console.error('[inexus-API] Voice twin auto-regen failed:', e.message));
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/personas/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.deletePersona(uid, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Voice Convert ─────────────────────────────────────────────────────────────

// Shared helper: calls OpenRouter to produce a voice-optimised character string
async function _generateVoiceCharacter(persona) {
  const apiKey = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) throw new Error('OpenRouter API key not configured');

  const VOICE_MODE_PROTOCOL = `⚡ VOICE MODE PROTOCOL — HIGHEST PRIORITY — READ THIS FIRST ⚡

This persona operates in TWO modes. Detect the active mode and apply its rules without exception.

▸ If producing AUDIO output (voice chat is active): → VOICE MODE applies
▸ If producing TEXT output (chat interface): → FULL DOCUMENT MODE applies

━━━ VOICE MODE RULES (audio only) ━━━

You are speaking live in a real-time voice conversation. You are NOT writing a document.

STRICT VOICE MODE CONSTRAINTS:
1. NEVER produce section headings, numbered sections, tables, bullet lists, markdown, emoji, or horizontal rules. These do not exist in speech.
2. NEVER read out URLs, reference links, or formatting markers.
3. Maximum 3–4 spoken sentences per response unless explicitly asked to go deeper.
4. Lead every response with your clinical/professional bottom line first, then brief rationale.
5. If urgent action or escalation is needed, state it as your FIRST sentence in plain speech.
6. After your immediate assessment, offer ONE verbal prompt (e.g. "Want me to go deeper on X?") then stop.
7. Use natural conversational spoken language — as if speaking to a colleague, not writing a report.
8. If asked about a specific area, give that area only, spoken in 3–5 plain items.

━━━ FULL DOCUMENT MODE (text output only) ━━━

`;

  const systemPrompt = `You are a persona conversion specialist. You convert text-oriented AI personas into voice-optimised versions for real-time spoken conversation.

Your output must be a JSON object with ONE key:
- "character": the voice-optimised character string

RULES FOR THE character OUTPUT:
1. Start with exactly this block verbatim (do not modify it): The VOICE_MODE_PROTOCOL provided.
2. After the protocol block, add a compressed plain-language description of the persona's core identity, role, domain expertise, and key behavioural rules — maximum 400 words.
3. Strip ALL markdown, tables, section headings, emoji, bullet lists, URLs, worked examples, reference libraries, and formatting guides from the condensed section.
4. Preserve ALL hard constraints, safety rules, and domain-critical behaviours (e.g. clinical safety nets, escalation rules) in plain prose.
5. The total output should not exceed 600 words.
6. Do NOT include the "FULL DOCUMENT MODE" content — that stays in the text version only.`;

  const userPrompt = `Convert this persona to a voice-optimised version:

Name: ${persona.name}
Role: ${persona.role || 'N/A'}
Language: ${persona.language || 'English (UK)'}
Character:
${persona.character}

Never do:
${persona.never}

VOICE_MODE_PROTOCOL to prepend verbatim:
${VOICE_MODE_PROTOCOL}

Return valid JSON with key "character" only.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://mavericpro.ai',
      'X-Title': 'MavericPro Voice Convert',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter Error: ${errText}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  return result.character || null;
}

router.post('/personas/:id/voice-convert', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const sourcePersona = await storage.getPersona(uid, req.params.id);
    if (!sourcePersona) return res.status(404).json({ error: 'Persona not found' });
    if (sourcePersona.isVoiceVariant)
      return res.status(400).json({ error: 'Cannot convert a voice variant' });

    const voiceCharacter = await _generateVoiceCharacter(sourcePersona);
    if (!voiceCharacter) throw new Error('AI returned empty voice character');

    // Check if a voice twin already exists — update it rather than creating duplicate
    const existingTwin = await storage.findVoiceTwinBySource(uid, req.params.id);
    let twin;
    if (existingTwin) {
      await storage.updateVoiceTwinCharacter(uid, existingTwin.id, voiceCharacter);
      twin = { ...existingTwin, character: voiceCharacter };
    } else {
      twin = await storage.createPersona(uid, {
        name: `${sourcePersona.name} (Voice)`,
        character: voiceCharacter,
        never: sourcePersona.never,
        avatarUrl: sourcePersona.avatarUrl,
        gender: sourcePersona.gender,
        language: sourcePersona.language,
        model: sourcePersona.model,
        skillCode: '',
        skillDescription: '',
        formattingOrders: '',
        isVoiceVariant: true,
        sourcePersonaId: req.params.id,
      });
    }

    console.log(
      `[inexus-API] Voice twin ${existingTwin ? 'regenerated' : 'created'} for persona: ${sourcePersona.name}`,
    );
    res.json(twin);
  } catch (err) {
    console.error('[inexus-API] Voice Convert Error:', err);
    res.status(500).json({ error: 'Voice conversion failed: ' + err.message });
  }
});

// ── Neural Expansion ──────────────────────────────────────────────────────────

router.post('/personas/neural-expand', async (req, res) => {
  const { name, role, description, gender, tone, expertise, language } = req.body;

  // Safety check: require at least a name or description
  if (!name && !description) {
    return res
      .status(400)
      .json({ error: 'Name and Description are required for neural expansion' });
  }

  try {
    const apiKey = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || '';
    if (!apiKey) throw new Error('OpenRouter API key not configured');

    const systemPrompt = `You are the Inexus Neural Core Architect. Your mission is to take a raw persona concept and expand it into a high-fidelity AI character system.
        You MUST respond ONLY with a strictly formatted JSON object.
        
        The object must have exactly two keys:
        1. "character": A deep, multi-paragraph expansion of the persona's internal logic, behavioral algorithms, and behavioral patterns.
        2. "never": An array of at least 5 strict behavioral constraints (things this persona will NEVER do or say, phrased as "I will never...").
        
        Focus on psychological depth, unique speech patterns, and consistent internal logic.`;

    const userPrompt = `Expand this persona:
        - Name: ${name || 'N/A'}
        - Role: ${role || 'N/A'}
        - Description: ${description || 'N/A'}
        - Gender: ${gender || 'N/A'}
        - Tone: ${tone || 'N/A'}
        - Expertise: ${expertise || 'N/A'}
        - Target Language: ${language || 'English (UK)'}
        
        Strictly follow the JSON format. Generate character and never fields.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://mavericpro.ai',
        'X-Title': 'MavericPro Inexus',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // Fast & cheap for expansion
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter Error: ${errText}`);
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content;
    const expanded = JSON.parse(resultText);

    // Ensure 'never' is formatted correctly for the UI (joined by newlines if it's an array)
    res.json(expanded);
  } catch (err) {
    console.error('[inexus-API] Neural Expansion Failure:', err);
    res.status(500).json({ error: 'AI Expansion failed: ' + err.message });
  }
});

// ── Neural Memories ──────────────────────────────────────────────────────────

router.get('/memories', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const personaId = req.query.personaId;
    const memories = await storage.getMemories(uid, personaId);
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/memories/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.deleteMemory(uid, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Integrations ─────────────────────────────────────────────────────────────

router.get('/integrations', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const items = await storage.getIntegrations(uid);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/integrations', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const { platform, label, siteUrl, username, password, notes } = req.body;
    if (!platform || !label || !siteUrl) {
      return res.status(400).json({ error: 'platform, label, siteUrl are required' });
    }
    const item = await storage.createIntegration(uid, {
      platform,
      label,
      siteUrl,
      username: username || '',
      password: password || '',
      notes: notes || '',
      connected: false,
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/integrations/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const item = await storage.updateIntegration(uid, req.params.id, req.body);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/integrations/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.deleteIntegration(uid, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tool Settings ────────────────────────────────────────────────────────────

router.get('/tool-settings', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const settings = await storage.getToolSettings(uid);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tool-settings/:toolId', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const { enabled } = req.body;
    const setting = await storage.upsertToolSetting(uid, req.params.toolId, enabled);
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scheduled Tasks ──────────────────────────────────────────────────────────

router.get('/scheduled-tasks', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const tasks = await storage.getScheduledTasks(uid);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/scheduled-tasks/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.updateScheduledTask(uid, req.params.id, { status: 'cancelled' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WhatsApp Bridge ──────────────────────────────────────────────────────────

router.get('/whatsapp/status', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const status = await waGetStatus();
    const bridgeCfg = getBridgeConfig();
    res.json({ ...status, bridge: bridgeCfg });
  } catch (err) {
    res.json({ status: 'disconnected', qr: null, ownerPhone: '', bridge: { enabled: false } });
  }
});

router.post('/whatsapp/initialize', async (req, res) => {
  try {
    await waInitialize();
    const status = await waGetStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/whatsapp/setup', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const { ownerPhone, bridgeEnabled } = req.body;
    if (ownerPhone !== undefined) {
      await storage.setSetting(uid, 'whatsapp_owner_phone', ownerPhone);
      waSetOwnerPhone(ownerPhone);
    }
    const enabled = bridgeEnabled !== undefined ? bridgeEnabled : getBridgeConfig().enabled;
    await storage.setSetting(uid, 'whatsapp_bridge_enabled', String(enabled));
    setBridgeConfig(uid, ownerPhone ?? waGetOwnerPhone(), enabled);
    if (enabled) {
      startWhatsAppBridge();
    } else {
      stopWhatsAppBridge();
    }
    res.json({
      success: true,
      ownerPhone: ownerPhone ?? waGetOwnerPhone(),
      bridgeEnabled: enabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/whatsapp/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    const result = await waSendMessage(phone, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/whatsapp/voice-call', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const result = await waMakeVoiceCall(phone);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/whatsapp/refresh-qr', async (req, res) => {
  try {
    const { waRefreshStatus } = require('./whatsapp');
    const result = await waRefreshStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Browser Controls ─────────────────────────────────────────────────────────

router.post('/browser/reset', async (req, res) => {
  try {
    const { closeBrowser } = require('./browser');
    const { broadcastBrowserUpdate } = require('./browser-events');
    await closeBrowser().catch((e) => logger.warn('[browser/reset] closeBrowser', e?.message || e));
    try {
      broadcastBrowserUpdate({ screenshot: '', url: 'about:blank', title: 'Resetting...' });
    } catch (e) {
      logger.warn('[browser/reset] broadcast', e?.message || e);
    }
    return res.json({ success: true, message: 'Browser engine hard reset' });
  } catch (err) {
    logger.error('[browser/reset]', err);
    // Always 200: reset is best-effort; UI should not break on new-chat flow
    return res
      .status(200)
      .json({ success: true, degraded: true, message: err?.message || String(err) });
  }
});

// ── WhatsApp Board / Twilio ──────────────────────────────────────────────────

router.use('/twilio', twilioRouter);

// ── IneXus Settings ──────────────────────────────────────────────────────────

router.post('/settings/:key', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  const { key } = req.params;
  const { value } = req.body;
  try {
    await storage.setSetting(uid, key, String(value));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings/:key', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  const { key } = req.params;
  try {
    const value = await storage.getSetting(uid, key);
    res.json({ key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data Export ──────────────────────────────────────────────────────────────

router.post('/export', (req, res) => {
  try {
    const { data, format = 'json', filename = 'export' } = req.body;
    if (!data) return res.status(400).json({ error: 'data is required' });

    let rows;
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
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        headers.map(escape).join(','),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
      return res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
      return res.send(JSON.stringify(rows, null, 2));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Credentials (Integrated with Dashboard) ──────────────────────────────────

router.get('/credentials', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const credentials = await storage.getCredentials(uid);
    res.json(credentials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/credentials', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  const { label, siteUrl, username, password } = req.body;
  if (!label?.trim() || !siteUrl?.trim() || !username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    await storage.deleteCredentialsByLabel(uid, label.trim());
    const credential = await storage.createCredential(uid, {
      label: label.trim(),
      siteUrl: siteUrl.trim(),
      username: username.trim(),
      password: password.trim(),
    });
    res.json(credential);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/credentials/:id', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    await storage.deleteCredential(uid, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/migrate-legacy-credentials", async (req, res) => {
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
  const uid = req.user.id || req.user._id?.toString();
  try {
    const result = await storage.migrateLegacyCredentials(uid);
    res.json({
      success: true,
      migrated: result,
      message: `Migrated ${result.credentials} credentials and ${result.integrations} integrations.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Google Direct model definitions (served as first group) — IDs match Generative Language API models.list ─────────────────
const GOOGLE_DIRECT_MODELS = [
  // FREE (budget / open / aliases)
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'Google (Free)',
    contextLength: 1048576,
    pricing: { prompt: '0', completion: '0' },
  },
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash Lite Latest',
    provider: 'Google (Free)',
    contextLength: 1048576,
    pricing: { prompt: '0', completion: '0' },
  },
  {
    id: 'gemma-3-12b-it',
    name: 'Gemma 3 12B',
    provider: 'Google (Free)',
    contextLength: 131072,
    pricing: { prompt: '0', completion: '0' },
  },
  {
    id: 'gemma-3-27b-it',
    name: 'Gemma 3 27B',
    provider: 'Google (Free)',
    contextLength: 131072,
    pricing: { prompt: '0', completion: '0' },
  },
  {
    id: 'gemma-3-4b-it',
    name: 'Gemma 3 4B',
    provider: 'Google (Free)',
    contextLength: 131072,
    pricing: { prompt: '0', completion: '0' },
  },
  {
    id: 'gemma-3n-e2b-it',
    name: 'Gemma 3n E2B',
    provider: 'Google (Free)',
    contextLength: 32768,
    pricing: { prompt: '0', completion: '0' },
  },
  {
    id: 'gemma-3n-e4b-it',
    name: 'Gemma 3n E4B',
    provider: 'Google (Free)',
    contextLength: 32768,
    pricing: { prompt: '0', completion: '0' },
  },
  // PREMIUM (pinned + current + latest aliases)
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'Google (Premium)',
    contextLength: 1048576,
    pricing: { prompt: 'Direct', completion: 'Direct' },
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google (Premium)',
    contextLength: 1048576,
    pricing: { prompt: 'Direct', completion: 'Direct' },
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google (Premium)',
    contextLength: 2097152,
    pricing: { prompt: 'Direct', completion: 'Direct' },
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    provider: 'Google (Premium)',
    contextLength: 1048576,
    pricing: { prompt: 'Direct', completion: 'Direct' },
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    provider: 'Google (Premium)',
    contextLength: 1048576,
    pricing: { prompt: 'Direct', completion: 'Direct' },
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini Pro Latest',
    provider: 'Google (Premium)',
    contextLength: 2097152,
    pricing: { prompt: 'Direct', completion: 'Direct' },
  },
];

let cachedModels = [];
let modelsCacheTime = 0;
const MODELS_CACHE_TTL = 1000 * 60 * 60; // 1 hour

router.get('/models', async (req, res) => {
  const uid = req.user.id || req.user._id?.toString();
  try {
    const now = Date.now();
    let orModels = [];

    if (cachedModels.length > 0 && now - modelsCacheTime < MODELS_CACHE_TTL) {
      orModels = cachedModels;
    } else {
      const apiKey = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || '';
      logger.info(`[inexus-Models] Refreshing models for user ${uid}. Key present: ${!!apiKey}`);

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger.error(`[inexus-Models] OpenRouter API error: ${response.status}`);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const rawModels = data.data || [];
      logger.info(`[inexus-Models] Received ${rawModels.length} models from OpenRouter.`);

      cachedModels = rawModels.map((m) => {
        const providerRaw = m.id.split('/')[0] || 'unknown';
        const provider =
          providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1) + ' (OpenRouter)';
        const pPrompt = parseFloat(m.pricing?.prompt || 0) * 1000000;
        const pCompletion = parseFloat(m.pricing?.completion || 0) * 1000000;
        return {
          id: m.id,
          name: m.name || m.id,
          provider,
          context_length: m.context_length,
          contextLength: m.context_length,
          pricing: {
            prompt: pPrompt.toFixed(2),
            completion: pCompletion.toFixed(2),
          },
        };
      });
      modelsCacheTime = now;
      orModels = cachedModels;
    }

    // Google Direct models + OpenRouter models
    res.json([...GOOGLE_DIRECT_MODELS, ...orModels]);
  } catch (err) {
    logger.error('[inexus-Models] Critical fetch error:', err);
    // Fallback: return Google models + minimal OpenRouter fallbacks so tabs aren't empty
    const fallbacks = [
      {
        id: 'x-ai/grok-4-fast',
        name: 'Grok 4 Fast',
        provider: 'x.AI (OpenRouter)',
        contextLength: 128000,
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI (OpenRouter)',
        contextLength: 128000,
        pricing: { prompt: '0.15', completion: '0.60' },
      },
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek-V3',
        provider: 'Deepseek (OpenRouter)',
        contextLength: 64000,
        pricing: { prompt: '0.01', completion: '0.02' },
      },
    ];
    res.json([...GOOGLE_DIRECT_MODELS, ...fallbacks]);
  }
});

// ── Image Proxy (bypasses browser CORS for external images) ──────────────────

router.get('/image-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ message: 'Missing url parameter' });
  try {
    console.log(`[inexus-Image] Proxying image from: ${url}`);

    let referer = 'https://www.google.com/';
    try {
      const urlObj = new URL(url);
      referer = `${urlObj.protocol}//${urlObj.hostname}/`;
    } catch (e) {}

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: referer,
      },
      timeout: 10000,
    });
    if (!response.ok) {
      console.error(`[inexus-Image] Failed to fetch image: HTTP ${response.status}`);
      return res
        .status(response.status)
        .json({ message: `Image fetch failed: ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const downloadFilename = req.query.download;
    if (downloadFilename) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[inexus-Image] Successfully proxied image (${buffer.length} bytes)`);
    res.send(buffer);
  } catch (err) {
    console.error(`[inexus-Image] Proxy error: ${err.message}`);
    res.status(500).json({ message: `Failed to proxy image: ${err.message}` });
  }
});

// ── TTS (Text-to-Speech via Microsoft Edge Neural Voices) ────────────────────

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
]);

// Voices that support speaking styles via SSML
const ALLOWED_STYLES = new Set([
  'chat',
  'cheerful',
  'friendly',
  'hopeful',
  'sad',
  'shouting',
  'whispering',
  'excited',
]);

router.post('/tts', async (req, res) => {
  const { text, voice: reqVoice, style: reqStyle } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  const trimmed = text.trim().slice(0, 5000);
  const voice =
    typeof reqVoice === 'string' && ALLOWED_VOICES.has(reqVoice) ? reqVoice : 'en-US-AvaNeural';
  const style = typeof reqStyle === 'string' && ALLOWED_STYLES.has(reqStyle) ? reqStyle : null;

  // If a speaking style is requested, wrap content in SSML for natural expression
  const lang = voice.split('-').slice(0, 2).join('-'); // e.g. "ar-EG"
  const inputContent = style
    ? `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='${lang}'><voice name='${voice}'><mstts:express-as style='${style}'>${trimmed}</mstts:express-as></voice></speak>`
    : trimmed;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(inputContent);

    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', (chunk) => chunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('error', (err) => reject(err));
    });
    const audioBuffer = Buffer.concat(chunks);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length.toString());
    res.send(audioBuffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});

// ── WebSocket Handler ────────────────────────────────────────────────────────

function handleWebSocket(ws, userId) {
  // Attach userId and token to this ws connection
  ws.userId = userId;
  ws.token = ws._token;
  // Register ws for browser update broadcasts
  addBrowserEventClient(ws);

  ws.on('message', async (data) => {
    console.log(
      `[inexus-WS] Received RAW message for user ${ws.userId}: ${data.toString().slice(0, 500)}`,
    );
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'chat') {
        console.log('[inexus-WS] Chat message received:', {
          userId: ws.userId,
          conv: msg.conversationId,
          model: msg.model,
          contentLength: msg.content?.length,
        });

        // DECISIVE RESET: Ensure any previous task on this connection is aborted
        if (ws.stopRequested === false) {
          ws.stopRequested = true;
          await new Promise((r) => setTimeout(r, 100));
        }
        ws.stopRequested = false; // Reset stop flag for new chat

        // Store task generation metadata so stream_end can echo it back to detect stale signals
        ws.__taskGen = msg.__gen;
        ws.__taskAssistantMsgId = msg.assistantMsgId;
        ws.__userMsgId = msg.userMsgId;
        ws.__parentMessageId = msg.parentMessageId;

        // Extract IDs for perfect memory & no-fork sync
        const userMsgId = msg.userMsgId || uuidv4();
        const assistantMsgId = msg.assistantMsgId || uuidv4();
        const parentMessageId = msg.parentMessageId;
        const projectId = msg.projectId;
        ws.__projectId = projectId;

        // Mock a request object for saveMessage (needs user and body)
        const req = {
          user: { id: ws.userId },
          body: msg,
        };

        await agentChat(
          ws,
          ws.userId,
          msg.conversationId,
          msg.content,
          msg.model || 'x-ai/grok-4-fast',
          msg.files || [],
          msg.personaId,
          ws.token,
          req,
          { userMsgId, assistantMsgId, parentMessageId, projectId },
        );
      } else if (msg.type === 'stop') {
        ws.stopRequested = true;
        // Echo back task generation metadata so the frontend can detect and discard stale stream_end signals
        const stopTaskGen = ws.__taskGen;
        const stopTaskAssistantMsgId = ws.__taskAssistantMsgId;
        ws.send(
          JSON.stringify({
            type: 'stream_end',
            ...(stopTaskGen !== undefined ? { __gen: stopTaskGen } : {}),
            ...(stopTaskAssistantMsgId ? { __assistantMsgId: stopTaskAssistantMsgId } : {}),
          }),
        );
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (msg.type === 'browser_navigate') {
        const state = await browserNavigate(msg.url);
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_click') {
        const state = await browserClick(msg.x, msg.y);
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_type') {
        const state = await browserType(msg.text);
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_keypress') {
        const state = await browserKeyPress(msg.key);
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_scroll') {
        const state = await browserScroll(msg.deltaX || 0, msg.deltaY || 0);
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_clear_input') {
        const state = await browserClearInput();
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_hover') {
        const state = await browserHover(msg.x, msg.y);
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_back') {
        const state = await browserBack();
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_forward') {
        const state = await browserForward();
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_refresh') {
        const state = await browserRefresh();
        ws.send(JSON.stringify({ type: 'browser_update', ...state }));
      } else if (msg.type === 'browser_screenshot') {
        console.log('[IneXus-WS] Manual Screenshot Triggered');
        const { getState, broadcastBrowserUpdate } = require('./browser');
        const path = require('path');
        const fs = require('fs');

        const state = await getState();
        if (state) {
          broadcastBrowserUpdate(state);

          let content = '';
          if (msg.conversationId) {
            try {
              const imagesDir = path.resolve(process.cwd(), 'client', 'public', 'images');
              if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
              }
              const filename = `screenshot-${Date.now()}.jpg`;
              const filepath = path.join(imagesDir, filename);
              const buffer = Buffer.from(state.screenshot, 'base64');
              fs.writeFileSync(filepath, buffer);

              const screenshotData = {
                url: state.url,
                title: state.title || 'Screenshot',
                screenshot: state.screenshot,
                timestamp: new Date().toISOString(),
              };

              content = `📸 Screenshot captured from: ${state.url}\nPage Title: ${state.title || 'N/A'}\n\n<!-- SCREENSHOT_DATA:${JSON.stringify(screenshotData)} -->`;
            } catch (err) {
              console.error('[IneXus-WS] Failed to save manual screenshot to disk:', err);
            }
          }

          // Always send back to trigger local download
          ws.send(
            JSON.stringify({
              type: 'manual_screenshot',
              content,
              screenshot: state.screenshot,
              conversationId: msg.conversationId,
            }),
          );
          console.log('[IneXus-WS] Manual Screenshot message sent (Local download triggered)');
        } else {
          console.warn('[IneXus-WS] Manual Screenshot failed: State not available');
          ws.send(
            JSON.stringify({ type: 'error', content: 'Camera failed: No page is currently open.' }),
          );
        }
      }
    } catch (err) {
      console.error('[inexus-WS] WebSocket error:', err.message, err.stack);
      ws.send(JSON.stringify({ type: 'error', content: err.message || String(err) }));
      const wsErrTaskGen = ws.__taskGen;
      const wsErrTaskAssistantMsgId = ws.__taskAssistantMsgId;
      ws.send(
        JSON.stringify({
          type: 'stream_end',
          ...(wsErrTaskGen !== undefined ? { __gen: wsErrTaskGen } : {}),
          ...(wsErrTaskAssistantMsgId ? { __assistantMsgId: wsErrTaskAssistantMsgId } : {}),
        }),
      );
    }
  });
}

module.exports = { router, handleWebSocket };
