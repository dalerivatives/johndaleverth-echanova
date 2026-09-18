# v81 — Live presence, instant World Chat, low-memory chat speech

## What changed

- Viewer count is now genuinely live across visitors. Each tab still sends a
  lightweight heartbeat, but joins/leaves/count changes are also pushed to all
  connected viewers through Server-Sent Events (SSE).
- Closing or navigating away sends an immediate leave beacon; a 30-second TTL
  remains as the crash/offline fallback, so abandoned tabs do not remain counted.
- The viewer label now adapts to narrow screens. It uses the full wording when
  there is room and automatically shortens to `N viewing now`, `N online`, or
  the bare number only when required. The full wording remains in ARIA/title.
- World Chat now has a live SSE notification feed. New posts trigger an
  immediate refresh for people currently watching the chat; a 10-second poll
  remains only as a compatibility/reconnect safety net.
- World Chat speech now works even when Render is kept in `SPEECH_MODE=static`.
  Dynamic phrases such as `Ana says. Hello` use one browser-selected English
  voice at a fixed rate/pitch, so the heavy Piper/ONNX model does not enter the
  low-memory Render process.
- The chat voice continues to say the sender's name before the message. The
  button tooltip now makes that behavior explicit.
- Static authored audio is preserved: the bundled whoami/terminal WAV paths
  still use the original audio engine. Higher-memory deployments can still set
  `SPEECH_MODE=dynamic` to use server Piper for arbitrary dynamic speech.

## Why World Chat was silent in v80

The Render configuration deliberately used `SPEECH_MODE=static` after the web
service exceeded its memory limit. In v80, `RobotVoice` only enabled itself when
`/api/speech/status` reported dynamic server speech, so incoming chat was marked
as seen but not spoken. v81 keeps the memory-safe server setting and supplies a
browser-side dynamic fallback instead of turning voice off.

## Deployment notes

1. Keep `SPEECH_MODE=static` on the current low-memory Render service.
2. Keep one Uvicorn worker. Presence/chat/robot live event buffers are in-memory
   and intentionally shared by the single process.
3. Preserve your existing `ADMIN_KEY`, `DATABASE_URL`, uploads and live content.
4. Deploy the application files and hard-refresh once after the deployment.

## Verification

- JavaScript speech lifecycle regression suite: PASS.
- Speech worker routing/cache regression suite: PASS.
- Site reliability regression suite: PASS.
- Python backend regression suite: 11 tests PASS (3 optional dynamic-Piper tests
  skipped, as expected in static mode).
- Additional v81 browser-fallback smoke test: PASS; a static-host dynamic chat
  phrase was spoken as one full utterance with a fixed voice/rate/pitch.
- Additional presence smoke test: PASS; 1 viewer -> 2 viewers -> leave -> 1
  viewer, with both `/api/presence/stream` and `/api/chat/stream` registered.
- The included Playwright suite was not executed in this build environment
  because the `playwright` Node module is not installed here.
