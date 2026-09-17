# v70 — circle-user and neural male speech

## What changed

- Anonymous visitors use exactly <i class="fa-solid fa-circle-user"></i>.
  The icon remains circular and adapts to theme colors.
- Replaced eSpeak's synthesized waveform with the local Piper John neural male
  voice. eSpeak remains internal to Piper only for converting words to phonemes.
- One steady speaking-rate setting for robot and terminal narration, low timing
  variation and no per-word browser speed or pitch changes.
- Complete audio is buffered before each utterance begins. All parts are decoded
  and combined into one playback buffer, avoiding network gaps between pieces.
- The terminal speaker announces Preparing voice while audio is being prepared,
  then Reading aloud. The same button cancels preparation or stops playback.
- Short utterance cache, bounded queues, CPU thread limits and short inference
  phrases keep work bounded. The neural model is loaded once per server process.
- The welcome remains exactly "Welcome to my world!", without a message box.
- Original Trevelade loading logo and circular registered avatars are retained.
- Font Awesome icons are served from bundled assets to reduce CDN dependencies.

## Deploy the complete update

Upload all project contents, including the voices directory and every .partNN
file. Keep your existing database, uploads, ADMIN_KEY and DATABASE_URL.
Run the normal Render build command: pip install -r requirements.txt.
Keep ONE Uvicorn worker. Do not replace only HTML/JS files: the backend now needs
piper-tts 1.3.0 and the bundled voice model. Local start.bat/start.sh install it.

The ZIP is larger because it contains the neural voice. The first dynamic speech
request assembles and loads it; subsequent requests reuse the loaded model.
No API key, paid speech subscription, or external voice request is required.
The welcome audio is already generated and does not wait for model loading.

A sample of the default terminal narration is included at
static/assets/voice-preview.wav. Actual terminal text still follows your editor.

The build environment generated the default narration and passed the backend,
loader and playback-control tests. The 500-character speech-only smoke check
used about 356 MiB peak memory and 4.74 seconds here; those figures are NOT a
Render benchmark or the complete app's RAM usage. Hosting load can differ.
Physical phone playback, browser visual layout and live Render deployment remain
unverified. See TEST_REPORT.md. KEEP_AWAKE.md still applies to hosting sleep.
