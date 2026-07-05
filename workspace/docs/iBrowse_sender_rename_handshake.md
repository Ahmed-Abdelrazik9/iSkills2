# iBrowse Sender Rename — Tail-Handshake

## What changed
Renamed the assistant sender displayed in chat threads from **iNexus** to **iBrowse** for the iBrowse/inexus agent.

- **Files changed:**
  - `MavericPro/client/src/hooks/Chat/useIneXusAgent.ts` — new assistant messages now set `sender: 'iBrowse'` instead of `sender: 'iNexus'`.
  - `MavericPro/client/src/hooks/Messages/useMessageActions.tsx` — display logic now maps both legacy `'iNexus'` and new `'iBrowse'` senders to the label **iBrowse**.

## Why
The inexus agent was already exposed to users as **iBrowse** in the UI toggles, but chat replies still showed the old internal name **iNexus** as the sender. This change makes the chat sender consistent with the rest of the UI.

## Verification
1. Pull the latest `main` commit `5e1794dfdc5d70b2b1e1d7efc598f36cb3459d84`.
2. Build and redeploy the client.
3. Start an iBrowse conversation.
4. New assistant replies should appear under **iBrowse** instead of **iNexus**.
5. Existing old messages previously sent by `iNexus` should also display as **iBrowse** due to the display-name mapping.

## Notes
- No backend or database migration is needed; this is a display-name/sender-value change on the client.
- The icon/avatar next to the sender name was not changed in this commit.
