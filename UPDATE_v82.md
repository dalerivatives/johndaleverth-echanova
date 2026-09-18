# v82 — Real-time presence, live chat delivery, and World Chat read-aloud

This build makes the public-facing live features react faster without enabling the heavy hosted neural speech model.

- Viewer presence now uses Server-Sent Events (SSE) for near-instant count updates across open visitors.
- Each tab still heartbeats every 10 seconds as a reliability fallback, while a normal page close sends an immediate leave signal so the count does not linger until timeout.
- The viewer badge shortens its text on narrow phones and shows a small live-connection pulse when the real-time feed is connected.
- World Chat now has an SSE room-change feed. New messages, admin deletes, and clears trigger an immediate refresh; the existing 5-second poll remains as a safety fallback.
- Chat rendering compares the complete visible message-ID window, so deletes and 24-hour expiry are reflected even when the newest message ID did not change.
- World Chat read-aloud now works even when Render is kept in `SPEECH_MODE=static`. If dynamic Piper speech is unavailable, the browser's best available English speech voice is used instead.
- New chat messages are spoken as **“<name> says, <message>”**, so the listener always hears who sent the message.
- The World Chat voice button remains a separate on/off control and still respects the site's master mute.
- The existing static `whoami` and `Code transform` voices are unchanged, so the low-memory Render deployment remains safe.

