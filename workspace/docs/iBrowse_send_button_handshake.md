# iBrowse Send Button Icon — Tail-Handshake

## What changed
The iBrowse (inexus agent) active-state send button in the chat input now uses the same **arrow send icon** as iSearch, instead of the previous amber lightning/Zap icon.

- **File:** `MavericPro/client/src/components/Chat/Input/SendButton.tsx`
- **Fix:** When `isIneXusAgentEnabled` is true, the button renders `<SendIcon size={22} className="text-amber-500" />` while keeping the existing amber iBrowse button styling. Other orange modes (inline image generation, image-request search) still use the `Zap` icon.

## Why
The user wanted the iBrowse send button to visually match the iSearch send button, which uses the standard arrow/send icon. Only the icon shape changed; the iBrowse amber button theme remains unchanged.

## Verification
1. Pull the latest `main` commit (see below).
2. Build and redeploy the client.
3. Enable **iBrowse** in the chat input.
4. The send button should show an amber arrow icon instead of the amber lightning/Zap icon.
5. Enable **iSearch** (or any other non-orange mode) and confirm the button still shows the standard arrow icon.

## Commit
- `ee7a2619438e9909aa5f0be06fc7ef7b44c90c41`
