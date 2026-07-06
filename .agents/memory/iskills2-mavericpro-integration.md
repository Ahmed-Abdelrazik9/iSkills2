---
name: iSkills2 MavericPro integration
description: How iSkills2 is embedded inside the MavericPro backend and the repo structure needed for pushes.
---

# iSkills2 inside MavericPro

## Pattern

iSkills2 is served from the MavericPro backend by:

1. Building the iSkills2 API router into a separate ESM bundle (`iskills2-router.mjs`).
2. Building the iSkills2 frontend with `BASE_PATH=/iskills2/` so assets are prefixed with `/iskills2/`.
3. Copying both built artifacts into the MavericPro app under `iskills2-built/`.
4. Loading the router via dynamic import from the CommonJS MavericPro server and mounting it at `/api/iskills2`.
5. Serving static files at `/iskills2` with a catch-all SPA fallback to `index.html`.

## Why

The iSkills2 artifact is an ESM TypeScript Express app; MavericPro is CommonJS. Dynamic import of the pre-built ESM bundle avoids re-writing the iSkills2 API in CommonJS and lets the same iSkills2 artifact serve both standalone and embedded modes.

## Repo structure

The MavericPro GitHub repo (`Ahmed-Abdelrazik9/MavericPro`) is a monorepo clone that has the MavericPro app at root (`MavericPro/`), not under `workspace/MavericPro` like the iSkills2 repo. Updating it requires cloning it directly, editing `MavericPro/api/server/index.js`, and pushing back; a `git subtree push` from the iSkills2 repo fails because the remote directory layout differs.

## Environment variables

- `ISKILLS2_DATABASE_URL` — required; falls back to the MavericPro `DATABASE_URL` at boot if not set.
- `ISKILLS2_JWT_SECRET` — required for module load; falls back to MavericPro `JWT_SECRET` at boot if not set. In production, set a dedicated secret to avoid cross-domain token coupling.

## Notes

- The integration is intentionally guarded: if the `iskills2-built/` files are missing, MavericPro logs a warning and continues without mounting `/iskills2`.
- Re-building the embedded artifacts is manual via `npm run build:iskills2` inside the MavericPro app directory; this should be added to the deployment build pipeline if it becomes a required feature.
