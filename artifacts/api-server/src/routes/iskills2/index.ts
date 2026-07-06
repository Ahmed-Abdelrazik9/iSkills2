import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { signToken } from "./auth";
import { SHARED_USER_ID } from "./db";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToSkill(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    tool: r.tool ?? null,
    enabled: r.enabled,
    isearch: r.isearch ?? false,
    priority: r.priority,
    triggerExamples: r.trigger_examples ?? [],
    usageCount: r.usage_count,
    lastUsedAt: r.last_used_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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
      "INSERT INTO iskills2_users (email, password_hash) VALUES ($1,$2) RETURNING *",
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
      res.status(409).json({ error: "Email already in use" });
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
      "SELECT * FROM iskills2_users WHERE email = $1",
      [email.toLowerCase().trim()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    res.json({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, createdAt: user.created_at },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM iskills2_users WHERE id = $1",
      [SHARED_USER_ID],
    );
    if (!rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    const u = rows[0];
    res.json({ id: u.id, email: u.email, createdAt: u.created_at });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
  const { name, description, instructions, tool, enabled, isearch, priority, triggerExamples } = req.body ?? {};
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  if (!description?.trim()) { res.status(400).json({ error: "description is required" }); return; }
  if (!instructions?.trim()) { res.status(400).json({ error: "instructions is required" }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO iskills2_skills
        (user_id, name, description, instructions, tool, enabled, isearch, priority, trigger_examples)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        SHARED_USER_ID,
        name.trim(),
        description.trim(),
        instructions.trim(),
        tool || null,
        enabled !== false,
        isearch === true,
        priority ?? 0,
        triggerExamples ?? [],
      ],
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
    const scored = rows
      .map((r: Record<string, unknown>) => ({ skill: r, score: scoreMatch(message, r) }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    const best = scored[0];
    const threshold = 0.15;
    if (best.score >= threshold) {
      const skill = rowToSkill(best.skill);
      const searchSignal = skill.isearch ? needsWebSearch(message) : { needsSearch: false, searchQuery: "" };
      let searchResults: { title: string; url: string; snippet: string }[] = [];
      if (searchSignal.needsSearch) {
        searchResults = await searchWeb(searchSignal.searchQuery);
      }
      res.json({
        matched: true,
        confidence: Math.min(best.score * 2, 1),
        skill,
        reason: `Matched "${best.skill.name}" with ${Math.round(best.score * 100)}% keyword overlap`,
        ...searchSignal,
        searchResults,
      });
    } else {
      res.json({ matched: false, confidence: best.score, skill: null, reason: "No skill matched the message", needsSearch: false, searchQuery: "", searchResults: [] });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate skill from natural language
router.post("/skills/generate", async (req, res) => {
  const { prompt } = req.body ?? {};
  if (!prompt?.trim()) { res.status(400).json({ error: "prompt required" }); return; }
  const p = prompt.trim().toLowerCase();

  // Derive a name from the first few significant words
  const stopWords = new Set(["a","an","the","to","for","that","and","or","with","using","which","when","i","want","need","create","make","build","skill","help","me"]);
  const words = prompt.trim().split(/\s+/).filter((w: string) => !stopWords.has(w.toLowerCase()) && w.length > 2);
  const rawName = words.slice(0, 4).join(" ");
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Generate trigger examples by extracting key noun phrases
  const triggerExamples: string[] = [];
  const keyPhrases = prompt.match(/[a-zA-Z]{4,}/g) ?? [];
  const filtered = [...new Set(keyPhrases.filter((w: string) => !stopWords.has(w.toLowerCase())))].slice(0, 3);
  if (filtered.length >= 2) triggerExamples.push(filtered.slice(0, 2).join(" "));
  if (filtered.length >= 3) triggerExamples.push(filtered.slice(1, 3).join(" "));
  if (prompt.length < 60) triggerExamples.push(prompt.trim());

  const instructions = [
    `You are a specialist assistant. The user has activated this skill because their message relates to: ${prompt.trim()}.`,
    ``,
    `When this skill is triggered:`,
    `1. Carefully read the user's message in full.`,
    `2. Apply domain expertise relevant to: ${prompt.trim()}.`,
    `3. Structure your response clearly with relevant sections.`,
    `4. Be concise, accurate, and immediately useful.`,
    `5. If information is missing, ask a clarifying question rather than guessing.`,
    `6. Never fabricate facts — state clearly when you are uncertain.`,
  ].join("\n");

  res.json({
    name: name || "New Skill",
    description: prompt.trim().length > 80 ? prompt.trim().slice(0, 77) + "..." : prompt.trim(),
    instructions,
    triggerExamples: [...new Set(triggerExamples)].slice(0, 3),
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
  const allowed = ["name","description","instructions","tool","enabled","isearch","priority","triggerExamples"] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }

  const colMap: Record<string, string> = {
    triggerExamples: "trigger_examples",
    name: "name", description: "description", instructions: "instructions",
    tool: "tool", enabled: "enabled", isearch: "isearch", priority: "priority",
  };
  const setClauses: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  for (const [k, v] of Object.entries(updates)) {
    setClauses.push(`${colMap[k]} = $${idx++}`);
    vals.push(v);
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
    const skill = rows[0];
    const score = scoreMatch(message, skill);
    const wouldTrigger = score >= 0.15;
    const injectedPrompt = [
      `[Skill: ${skill.name}]`,
      ``,
      skill.instructions,
      ``,
      `User message: ${message}`,
    ].join("\n");
    const sampleResponse = wouldTrigger
      ? `✓ This skill would activate.\n\nThe agent would receive your instructions injected into the context before replying. With the "${skill.name}" skill active, responses will follow your specified instructions above.`
      : `✗ This skill would NOT trigger for this message.\n\nThe trigger score (${Math.round(score * 100)}%) is below the 15% threshold. Try adding more specific keywords to the Activation Trigger or Example Messages fields that match this type of input.`;

    res.json({ wouldTrigger, triggerScore: Math.round(score * 100) / 100, injectedPrompt, sampleResponse });
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
