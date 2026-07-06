# iSkills Auto-Trigger for Web Search (iSearch) — Tail-Handshake

## What changed
Skills created in the iSkill app can now automatically trigger web search when the skill is enabled and configured with `tool: 'search_web'`.

- **`MavericPro/api/server/routes/inexus/schema.ts`** — added `tool` column to the `inexus_skills` table.
- **`MavericPro/api/server/routes/inexus/storage.ts`** — added `ALTER TABLE inexus_skills ADD COLUMN IF NOT EXISTS tool TEXT DEFAULT 'none'` migration.
- **`MavericPro/api/server/routes/inexus/agent.ts`** — when an enabled skill has `tool === 'search_web'`, the iBrowse agent runs `searchWeb()` before the LLM call and prepends the DuckDuckGo results to the system prompt. The UI receives `tool_start` and `tool_result` messages.
- **`MavericPro/api/server/routes/inexus/agent.js`** — same behavior for the main-app iBrowse agent; also added the skills summary to the system prompt so all enabled skills are visible to the LLM.

## Why
Previously, skills were only text instructions injected into the prompt. The LLM could decide to use `search_web`, but it had to be explicitly asked. Now a skill can declare that it should auto-run web search, giving the agent iSearch-quality web context without requiring the user to toggle iSearch or type "search the web".

## Commit
- `c459183fb50a775733aaea57096fc1c5c118c1d2`

## Verification
1. Pull the latest PR commit (`c459183fb50a775733aaea57096fc1c5c118c1d2`).
2. Build and redeploy the API server so the `tool` column migration runs.
3. Open the iSkill / iAgent dashboard and create or edit a skill.
4. Set the skill's **Auto-trigger tool** to `search_web` (or save it with `tool: 'search_web'`).
5. Enable the skill.
6. Start an iBrowse conversation and send a message matching the skill's description.
7. The agent should immediately show a `search_web` step, then answer using the search results.

## Notes
- The UI dropdown must send `tool` in the create/update skill payload. If the dashboard does not send it, the backend will default to `none` and the auto-trigger will not fire.
- This uses the iBrowse agent's built-in `search_web` tool (DuckDuckGo). It does **not** call the separate Agent-OS iSearch engine over SSE; that integration requires the `agent-os` API server code.
- Only enabled skills are evaluated. A skill with `tool: 'search_web'` and `enabled: false` will not trigger search.

## PR
- https://github.com/Ahmed-Abdelrazik9/MavericPro/pull/1
