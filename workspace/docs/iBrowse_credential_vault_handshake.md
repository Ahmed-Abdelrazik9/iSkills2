# iBrowse Credential Vault Retrieval — Tail-Handshake

## What changed
Fixed iBrowse so it can retrieve credentials saved in the iCredentials / iAgent vault instead of only working when the website and credentials are pasted directly into chat.

## Files changed
- `MavericPro/api/server/routes/inexus/routes.ts` — credential and integration routes now pass the authenticated `userId` into every storage call (`getCredentials`, `createCredential`, `deleteCredential`, `deleteCredentialsByLabel`, `getIntegrations`, `createIntegration`, `updateIntegration`, `deleteIntegration`).
- `MavericPro/api/server/routes/inexus/storage.ts` — added `migrateLegacyCredentials(userId)` to move rows saved under the pre-scoping placeholder user (`default-user`) into the authenticated user's scope. The migration is wrapped in a DB transaction and guarded by `pg_advisory_xact_lock(123456)` to prevent concurrent duplication.
- `MavericPro/api/server/routes/inexus/index.js` — added `POST /api/inexus/migrate-legacy-credentials` endpoint for the main-app path.
- `MavericPro/api/server/routes/inexus/routes.ts` — added `POST /api/migrate-legacy-credentials` endpoint for the standalone-dev-server path.
- `MavericPro/api/server/routes/inexus/agent.ts` and `agent.js` — when `get_credentials` finds no matching credentials for the current user but legacy placeholder-user rows exist, the agent now tells the user to call the migration endpoint once to claim them.

## Why
Previously, credentials and integrations could be saved without a real userId and ended up under the placeholder `default-user` row. The iBrowse agent was looking for credentials under the authenticated user's scope, so it never found them. This change restores retrieval for existing legacy vault entries while ensuring new saves are correctly scoped.

## Verification
1. Pull the latest PR commit.
2. Build and redeploy the API server.
3. Open the iAgent / iCredentials dashboard and confirm saved credentials/integrations are visible.
4. Start an iBrowse conversation and ask it to navigate to a site for which credentials are saved.
5. iBrowse should call `get_credentials`, retrieve the saved username/password, and log in automatically.
6. If the agent says no credentials are found but legacy rows exist, set `INEXUS_ENABLE_LEGACY_CREDENTIAL_MIGRATION=true`, call the migration endpoint once, and retry.

## Security note
The migration endpoint is gated by the `INEXUS_ENABLE_LEGACY_CREDENTIAL_MIGRATION` environment variable. It must be explicitly enabled by the operator before any legacy `default-user` rows can be moved into an authenticated user's scope. Only admins can run the migration, which prevents accidental cross-user claiming in multi-user deployments. The standalone dev server also requires an admin role; it does not allow unauthenticated callers.

## Endpoint
- Main app path: `POST /api/inexus/migrate-legacy-credentials`
- Standalone dev server path: `POST /api/migrate-legacy-credentials`

## PR
- https://github.com/Ahmed-Abdelrazik9/MavericPro/pull/1
