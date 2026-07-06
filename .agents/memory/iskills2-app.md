---
name: iSkills2 app
description: Standalone skill manager app — architecture, env vars, DB tables, route structure.
---

## Architecture
- Frontend: `artifacts/iskills2` (React + Vite, previewPath `/iskills2/`)
- Backend routes: `artifacts/api-server/src/routes/iskills2/` mounted at `/api/iskills2`
- DB: Railway Postgres via env var `ISKILLS2_DATABASE_URL`
- Auth: JWT via `ISKILLS2_JWT_SECRET` (30d tokens, stored in localStorage as `iskills2_token`)

## DB tables (auto-created on boot)
- `iskills2_users` — id, email, password_hash, created_at
- `iskills2_skills` — id, user_id, name, description, instructions, tool, enabled, priority, trigger_examples (TEXT[]), usage_count, last_used_at, created_at, updated_at

## Color palette (matches original iSkill)
- Background: #F5F1EB (warm parchment), border: #E8E3DA
- Primary: gradient #C4A882 → #B89872 → #A08B6A (gold/tan)
- Labels: uppercase tracking-widest #C4A882, body: slate-900/slate-500

## Key files
- `artifacts/api-server/src/routes/iskills2/db.ts` — Railway pg Pool, SSL auto-detected by hostname
- `artifacts/api-server/src/routes/iskills2/auth.ts` — JWT sign/verify, requireAuth middleware
- `artifacts/api-server/src/routes/iskills2/index.ts` — all route handlers (auth, skills CRUD, match, generate, test, stats)
- `artifacts/api-server/src/routes/index.ts` — mounts iskills2Router at /iskills2

**Why:** built because the original iSkill in MavericPro had repeated unfixable legacy DB issues (label NOT NULL). Clean slate with no legacy columns.
