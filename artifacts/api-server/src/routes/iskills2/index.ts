import { Router } from "express";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import { pool } from "./db";
import { signToken } from "./auth";
import { SHARED_USER_ID } from "./db";
import { extractUrls, fetchUrl } from "./ssrf";

const router = Router();

const hasLlmKey = !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);

const openai = new OpenAI(
  process.env.OPENROUTER_API_KEY
    ? { baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY }
    : { apiKey: process.env.OPENAI_API_KEY || undefined },
);

const LLM_MATCH_MODEL = process.env.OPENROUTER_API_KEY ? "openai/gpt-4o-mini" : "gpt-5-mini";
const LLM_GENERATE_MODEL = process.env.OPENROUTER_API_KEY ? "openai/gpt-4o" : "gpt-5.4";

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToSkill(r: any) {
  const tools = parseTools(r.tools);
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    tool: r.tool ?? null,
    enabled: r.enabled,
    isearch: r.isearch ?? false,
    tools,
    matchMode: r.match_mode ?? "keyword",
    priority: r.priority,
    triggerExamples: r.trigger_examples ?? [],
    usageCount: r.usage_count,
    lastUsedAt: r.last_used_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseTools(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTools(value: any): string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string");
    } catch {
      return [value];
    }
  }
  return [];
}

function getEffectiveTools(skill: any): string[] {
  const tools = skill.tools && skill.tools.length ? skill.tools : [];
  if (!tools.length && skill.isearch) return ["isearch"];
  return tools;
}

async function searchWeb(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Cookie": "kl=wt-wt",
      },
    });
    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }
    const html = await response.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      if (title && url) {
        results.push({ title, url, snippet: "" });
      }
    }
    let idx = 0;
    while ((match = snippetRegex.exec(html)) !== null && idx < results.length) {
      const snippet = match[1].replace(/<[^>]+>/g, "").trim();
      if (snippet) {
        results[idx].snippet = snippet;
      }
      idx++;
    }
    return results;
  } catch (err: any) {
    console.error("[iSkills2] web search failed:", err.message);
    return [];
  }
}

function needsWebSearch(message: string): { needsSearch: boolean; searchQuery: string } {
  const m = (message || "").toLowerCase();
  const freshnessSignals = [
    "today", "now", "current", "latest", "recent", "live", "right now", "this morning",
    "this afternoon", "tonight", "this week", "this month", "this year", "updated",
    "result", "results", "score", "match", "game", "weather", "news", "price", "stock",
    "who won", "who is winning", "did they win", "election", "covid", "bitcoin", "rate",
  ];
  const hasSignal = freshnessSignals.some((s) => m.includes(s));
  const hasTimePattern = /\b(202[0-9]|today|yesterday|tomorrow|now)\b/.test(m);
  const needsSearch = hasSignal || hasTimePattern;
  return { needsSearch, searchQuery: needsSearch ? message.trim() : "" };
}

function scoreMatch(message: string, skill: any): number {
  const hay = (message || "").toLowerCase();
  const tokens = [
    ...(skill.description || "").toLowerCase().split(/[\s,;.]+/),
    ...(skill.trigger_examples || []).flatMap((e: string) =>
      e.toLowerCase().split(/[\s,;.]+/),
    ),
    ...(skill.name || "").toLowerCase().split(/[\s,;.]+/),
  ].filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length;
}

async function llmMatch(
  message: string,
  skills: any[],
): Promise<{ skillId: string | null; confidence: number; reason: string } | null> {
  if (!hasLlmKey) return null;
  if (!skills.length) return null;

  const prompt = `You are a skill classifier. Given a user message and a list of skills, pick the single skill that best matches the user's intent. Return only a JSON object with keys: skillId (string id of best skill, or null if none), confidence (number 0-1), reason (short explanation).

Skills:
${skills.map((s) => `- id: ${s.id}
  name: ${s.name}
  description: ${s.description}
  instructions summary: ${(s.instructions || "").slice(0, 120)}
  trigger examples: ${(s.trigger_examples || []).join(", ")}`).join("\n\n")}

User message: "${message}"

Return JSON:`;

  try {
    const response = await openai.chat.completions.create({
      model: LLM_MATCH_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 256,
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content || "";
    const parsed = JSON.parse(content);
    const skillId = typeof parsed.skillId === "string" && parsed.skillId ? parsed.skillId : null;
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "LLM selected best match";
    return { skillId, confidence, reason };
  } catch (err: any) {
    console.error("[iSkills2] LLM match failed:", err.message);
    return null;
  }
}

async function runTool(
  tool: string,
  message: string,
): Promise<{ type: string; status: string; output: any }> {
  switch (tool) {
    case "isearch": {
      const { needsSearch, searchQuery } = needsWebSearch(message);
      if (!needsSearch) {
        return { type: "isearch", status: "skipped", output: { needsSearch, searchQuery, searchResults: [] } };
      }
      const searchResults = await searchWeb(searchQuery);
      return { type: "isearch", status: "ok", output: { needsSearch, searchQuery, searchResults } };
    }
    case "web_fetch": {
      const urls = await extractUrls(message);
      if (!urls.length) {
        return { type: "web_fetch", status: "skipped", output: { urls: [], results: [] } };
      }
      const results = (await Promise.all(urls.map(fetchUrl))).filter(Boolean) as { title: string; url: string; snippet: string }[];
      return { type: "web_fetch", status: "ok", output: { urls, results } };
    }
    default:
      return { type: tool, status: "unknown_tool", output: null };
  }
}

async function executeTools(tools: string[], message: string) {
  const results = await Promise.all(tools.map((tool) => runTool(tool, message)));
  // Backward-compatible top-level fields for existing clients
  const isearch = results.find((r) => r.type === "isearch" && r.status === "ok")?.output;
  return {
    toolResults: results,
    needsSearch: isearch?.needsSearch ?? false,
    searchQuery: isearch?.searchQuery ?? "",
    searchResults: isearch?.searchResults ?? [],
  };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password || password.length < 6) {
    res.status(400).json({ error: "Email and password (min 6 chars) required" });
    return;
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO iskills2_users (id, email, password_hash) VALUES ($1,$2,$3) RETURNING *",
      [email.toLowerCase().trim(), hash],
    );
    const user = rows[0];
    const token = signToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.created_at },
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM iskills2_users WHERE email=$1",
      [email.toLowerCase().trim()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.created_at },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/auth/me", async (req, res) => {
  res.json({ id: SHARED_USER_ID, email: "shared@iskills2.local", createdAt: "2024-01-01T00:00:00Z" });
});

// ── Skills ────────────────────────────────────────────────────────────────────

router.get("/skills", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM iskills2_skills WHERE user_id=$1 ORDER BY priority DESC, created_at DESC",
      [SHARED_USER_ID],
    );
    res.json(rows.map(rowToSkill));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/skills", async (req, res) => {
  const { name, description, instructions, tool, enabled, isearch, tools, matchMode, priority, triggerExamples } = req.body ?? {};
  if (!name || !description || !instructions) {
    res.status(400).json({ error: "name, description, and instructions required" });
    return;
  }
  try {
    const finalTools = normalizeTools(tools) ?? (isearch ? ["isearch"] : []);
    const finalMatchMode = matchMode === "llm" ? "llm" : "keyword";
    const { rows } = await pool.query(
      `INSERT INTO iskills2_skills
        (user_id, name, description, instructions, tool, enabled, isearch, tools, match_mode, priority, trigger_examples)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [SHARED_USER_ID, name, description, instructions, tool || null, enabled !== false, isearch || false, JSON.stringify(finalTools), finalMatchMode, priority ?? 0, triggerExamples || []],
    );
    res.status(201).json(rowToSkill(rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Match endpoint BEFORE /:id so it isn't swallowed as an id param
router.post("/skills/match", async (req, res) => {
  const { message } = req.body ?? {};
  if (!message) { res.status(400).json({ error: "message required" }); return; }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM iskills2_skills WHERE user_id=$1 AND enabled=true",
      [SHARED_USER_ID],
    );
    if (!rows.length) {
      res.json({ matched: false, confidence: 0, skill: null, reason: "No enabled skills" });
      return;
    }

    let best: { skill: any; confidence: number; reason: string } | null = null;

    // Try LLM matching only among skills explicitly configured for LLM mode.
    const llmRows = rows.filter((r) => (r.match_mode || "keyword") === "llm");
    if (llmRows.length && hasLlmKey) {
      const llm = await llmMatch(message, llmRows);
      if (llm && llm.skillId && llm.confidence >= 0.5) {
        const matched = llmRows.find((r) => r.id === llm.skillId);
        if (matched) {
          best = { skill: matched, confidence: llm.confidence, reason: llm.reason };
        }
      }
    }

    // Fallback to keyword matching only among skills configured for keyword mode.
    if (!best) {
      const keywordRows = rows.filter((r) => (r.match_mode || "keyword") === "keyword");
      const scored = keywordRows
        .map((r: Record<string, unknown>) => ({ skill: r, score: scoreMatch(message, r) }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const top = scored[0];
      const threshold = 0.15;
      if (top.score >= threshold) {
        best = { skill: top.skill, confidence: Math.min(top.score * 2, 1), reason: `Matched "${top.skill.name}" with ${Math.round(top.score * 100)}% keyword overlap` };
      }
    }

    if (best) {
      const skill = rowToSkill(best.skill);
      const tools = getEffectiveTools(skill);
      const toolOutput = await executeTools(tools, message);
      res.json({
        matched: true,
        confidence: best.confidence,
        skill,
        reason: best.reason,
        ...toolOutput,
      });
    } else {
      res.json({ matched: false, confidence: 0, skill: null, reason: "No skill matched the message", needsSearch: false, searchQuery: "", searchResults: [], toolResults: [] });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/skills/generate", async (req, res) => {
  const { prompt } = req.body ?? {};
  if (!prompt?.trim()) { res.status(400).json({ error: "prompt required" }); return; }

  const hasLlmKey = !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);

  if (hasLlmKey) {
    try {
      const systemPrompt = `You are a skill designer for an AI assistant platform. Given a user description, create a skill definition.

Return only a JSON object with these fields:
- name: concise, title-case skill name (max 6 words)
- description: 1-2 sentences describing when the skill should activate
- instructions: a system prompt that guides the AI when this skill is active (4-8 sentences)
- triggerExamples: array of 3 example user messages that should activate this skill
- tools: array of tool names. Available tools: "isearch" (web search) and "web_fetch" (fetch URLs mentioned in the message). Only include tools if the skill would benefit from live web data.
- matchMode: either "llm" or "keyword". Use "llm" for nuanced intent matching, "keyword" for simple keyword matching.

User description: "${prompt.trim()}"

Return JSON:`;

      const response = await openai.chat.completions.create({
        model: LLM_GENERATE_MODEL,
        messages: [{ role: "user", content: systemPrompt }],
        max_completion_tokens: 1024,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "";
      const parsed = JSON.parse(content);
      res.json({
        name: String(parsed.name || "New Skill").slice(0, 80),
        description: String(parsed.description || prompt.trim()).slice(0, 300),
        instructions: String(parsed.instructions || "").slice(0, 4000),
        triggerExamples: Array.isArray(parsed.triggerExamples) ? parsed.triggerExamples.slice(0, 5).map(String) : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools.filter((t: string) => ["isearch", "web_fetch"].includes(t)) : [],
        matchMode: parsed.matchMode === "llm" ? "llm" : "keyword",
      });
      return;
    } catch (err: any) {
      console.error("[iSkills2] LLM generate failed, falling back to heuristic:", err.message);
    }
  }

  // Heuristic fallback when no API key or LLM call fails.
  const p = prompt.trim().toLowerCase();
  const stopWords = new Set(["a","an","the","to","for","that","and","or","with","using","which","when","i","want","need","create","make","build","skill","help","me"]);
  const words = prompt.trim().split(/\s+/).filter((w: string) => !stopWords.has(w.toLowerCase()) && w.length > 2);
  const rawName = words.slice(0, 4).join(" ");
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const triggerExamples: string[] = [];
  const keyPhrases = prompt.match(/[a-zA-Z]{4,}/g) ?? [];
  const filtered = [...new Set(keyPhrases.filter((w: string) => !stopWords.has(w.toLowerCase())))].slice(0, 3);
  if (filtered.length >= 2) triggerExamples.push(filtered.slice(0, 2).join(" "));
  if (filtered.length >= 3) triggerExamples.push(filtered.slice(1, 3).join(" "));
  if (prompt.length < 60) triggerExamples.push(prompt.trim());
  const instructions = [
    `You are a specialist assistant. The user has activated this skill because their message relates to: ${prompt.trim()}.`,
    "",
    "When this skill is triggered:",
    "1. Carefully read the user's message in full.",
    `2. Apply domain expertise relevant to: ${prompt.trim()}.`,
    "3. Structure your response clearly with relevant sections.",
    "4. Be concise, accurate, and immediately useful.",
    "5. If information is missing, ask a clarifying question rather than guessing.",
    "6. Never fabricate facts — state clearly when you are uncertain.",
  ].join("\n");
  res.json({
    name: name || "New Skill",
    description: prompt.trim().length > 80 ? prompt.trim().slice(0, 77) + "..." : prompt.trim(),
    instructions,
    triggerExamples: [...new Set(triggerExamples)].slice(0, 3),
    tools: ["isearch"],
    matchMode: "keyword",
  });
});

router.get("/skills/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM iskills2_skills WHERE id=$1 AND user_id=$2",
      [req.params.id, SHARED_USER_ID],
    );
    if (!rows[0]) { res.status(404).json({ error: "Skill not found" }); return; }
    res.json(rowToSkill(rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/skills/:id", async (req, res) => {
  const updates: Record<string, any> = {};
  const allowed = ["name","description","instructions","tool","enabled","isearch","tools","matchMode","priority","triggerExamples"] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }

  const colMap: Record<string, string> = {
    triggerExamples: "trigger_examples",
    name: "name", description: "description", instructions: "instructions",
    tool: "tool", enabled: "enabled", isearch: "isearch", tools: "tools", matchMode: "match_mode", priority: "priority",
  };
  const setClauses: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  for (const [k, v] of Object.entries(updates)) {
    setClauses.push(`${colMap[k]} = $${idx++}`);
    if (k === "tools") {
      const normalized = normalizeTools(v) ?? [];
      vals.push(JSON.stringify(normalized));
    } else if (k === "matchMode") {
      vals.push(v === "llm" ? "llm" : "keyword");
    } else {
      vals.push(v);
    }
  }
  setClauses.push(`updated_at = NOW()`);
  vals.push(req.params.id, SHARED_USER_ID);

  try {
    const { rows } = await pool.query(
      `UPDATE iskills2_skills SET ${setClauses.join(", ")} WHERE id=$${idx} AND user_id=$${idx+1} RETURNING *`,
      vals,
    );
    if (!rows[0]) { res.status(404).json({ error: "Skill not found" }); return; }
    res.json(rowToSkill(rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/skills/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM iskills2_skills WHERE id=$1 AND user_id=$2",
      [req.params.id, SHARED_USER_ID],
    );
    if (!rowCount) { res.status(404).json({ error: "Skill not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Test skill against a sample message
router.post("/skills/:id/test", async (req, res) => {
  const { message } = req.body ?? {};
  if (!message) { res.status(400).json({ error: "message required" }); return; }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM iskills2_skills WHERE id=$1 AND user_id=$2",
      [req.params.id, SHARED_USER_ID],
    );
    if (!rows[0]) { res.status(404).json({ error: "Skill not found" }); return; }
    const skill = rowToSkill(rows[0]);

    let wouldTrigger = false;
    let triggerScore = 0;
    let reason = "No match";

    if (skill.matchMode === "llm") {
      if (hasLlmKey) {
        const llm = await llmMatch(message, [rows[0]]);
        if (llm && llm.skillId === skill.id) {
          wouldTrigger = llm.confidence >= 0.5;
          triggerScore = llm.confidence;
          reason = llm.reason;
        }
      } else {
        reason = "LLM matching is unavailable (no API key configured).";
      }
    } else {
      const score = scoreMatch(message, rows[0]);
      triggerScore = score;
      wouldTrigger = score >= 0.15;
      reason = wouldTrigger
        ? `Matched "${skill.name}" with ${Math.round(score * 100)}% keyword overlap`
        : `The trigger score (${Math.round(score * 100)}%) is below the 15% threshold. Try adding more specific keywords to the Activation Trigger or Example Messages fields that match this type of input.`;
    }

    const injectedPrompt = [
      `[Skill: ${skill.name}]`,
      "",
      skill.instructions,
      "",
      `User message: ${message}`,
    ].join("\n");

    const sampleResponse = wouldTrigger
      ? `✓ This skill would activate.\n\nThe agent would receive your instructions injected into the context before replying. With the "${skill.name}" skill active, responses will follow your specified instructions above.`
      : `✗ This skill would NOT trigger for this message.\n\n${reason}`;

    res.json({ wouldTrigger, triggerScore: Math.round(triggerScore * 100) / 100, injectedPrompt, sampleResponse, reason, matchMode: skill.matchMode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Record a use
router.post("/skills/:id/use", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE iskills2_skills SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id=$1 AND user_id=$2",
      [req.params.id, SHARED_USER_ID],
    );
    if (!rowCount) { res.status(404).json({ error: "Skill not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/stats", async (req, res) => {
  try {
    const [totals, top] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active, COALESCE(SUM(usage_count),0) AS uses FROM iskills2_skills WHERE user_id=$1",
        [SHARED_USER_ID],
      ),
      pool.query(
        "SELECT id, name, usage_count, last_used_at FROM iskills2_skills WHERE user_id=$1 ORDER BY usage_count DESC LIMIT 5",
        [SHARED_USER_ID],
      ),
    ]);
    const row = totals.rows[0];
    res.json({
      totalSkills: Number(row.total),
      activeSkills: Number(row.active),
      totalUses: Number(row.uses),
      topSkills: top.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        usageCount: r.usage_count,
        lastUsedAt: r.last_used_at ?? null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
