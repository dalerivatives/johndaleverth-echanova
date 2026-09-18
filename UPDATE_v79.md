# v79 — Render memory-safe voice and resilient startup

- Production now uses `SPEECH_MODE=static` in `render.yaml`, so the Piper/ONNX
  model is not loaded on low-memory Render instances.
- The default terminal narration uses the bundled
  `static/assets/voice-preview.wav`, preserving the same male neural voice with
  fast playback and no server inference.
- `whoami` continues to use its bundled `whoami-robot.wav` file.
- Dynamic chat speech is hidden in static mode. It can be restored on a larger
  instance by setting `SPEECH_MODE=dynamic`.
- Settings and content requests now time out safely after seven seconds. An
  optional image, voice file, or API failure no longer traps visitors on the
  loading screen.
- Asset versions were bumped to v79 so browsers request the corrected scripts.
