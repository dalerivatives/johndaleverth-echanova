# Portfolio v66 — loading, visitors and robot speech

## Install / deploy

- Local Windows: extract, run start.bat. Python and internet access are needed
  for the first dependency installation. Keep your existing database/uploads.
- Render: deploy the project contents at the same repository root as before.
  Build command remains `pip install -r requirements.txt`; start command remains
  the existing single-worker Uvicorn command. The new eSpeak NG dependency must
  be installed; static-file-only replacement is insufficient for dynamic speech.
- Preserve ADMIN_KEY, DATABASE_URL and all existing Render environment settings.
  This archive contains no credentials or copy of your live database.
- Follow KEEP_AWAKE.md to enable the included .github/workflows/keep-awake.yml.
  No hosting configuration or live deployment has been performed by this ZIP.

## Changes

- Same low male/robot voice on desktop and mobile. Dynamic speech is synthesized
  by eSpeak NG on your server, never by a device's default/female voice and never
  through an external text-to-speech service. English is the configured language.
- The whoami introduction is included as a WAV asset, so it does not need a live
  synthesis request. Press Enter after typing whoami. The portrait reveals with
  an animated voice indicator and a text caption. Existing voice-off preference
  is respected. Type code to hide the photo/caption and stop speech.
- Browser audio requires a visitor interaction and can be affected by the
  device's silent mode/audio permissions. Failed playback leaves text available.
- Speech queue is bounded, interrupt/stop cancels pending work, and stale worker
  responses cannot restart stopped speech. Dynamic speech endpoint limits text,
  request frequency and concurrent synthesis, with a bounded in-memory cache.
- Guests use plain circular placeholders; named visitors retain chat avatars.
  The +N badge is removed. Full singular/plural count stays visible. The existing
  presence mechanism counts active browser sessions, not verified unique people.
- Trevelade loading screen waits for settings, CMS content, images, fonts, page
  resources and the welcome voice. Slow/failed loads offer Retry or Continue.
  Continue explicitly permits partial content. Live chat, GitHub activity, remote
  link previews and playable media streams keep their own asynchronous loading;
  a live site cannot finish every stream before displaying anything.
- Correct custom-domain keep-awake URL, five-minute workflow, JSON/status checks,
  and Render liveness path. Free hosting still has provider-level sleep/restarts.

## Verification

See TEST_REPORT.md for checks performed and their limits. There is no meaningful
way to certify any website as 100% bug-free on every device or hosting state.

## Voice dependency

eSpeak NG is installed as espeakng-loader 0.2.4 via pip, with its upstream license
and notices. The generated welcome WAV is project content. No proprietary voice,
external paid API, or OS-selected female fallback is included.
