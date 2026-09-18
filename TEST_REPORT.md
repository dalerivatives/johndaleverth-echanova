# v80 verification

Passed in the build environment:

- All first-party JavaScript syntax checks and backend compilation.
- Real Canvas PNG checks: transparent corner pixels, opaque centre, centre crop
  without stretching, safe removal/error behavior, stale update protection,
  cross-tab propagation, and absence of the header logo markup.
- Loader checks: normal release, API/image fallback, hidden images remaining
  lazy, seven-second overall budget, critical-file recovery, timer cleanup, and
  exactly one readiness event.
- Speech-controller and worker checks: playback/cancel/queue/first-tap behavior,
  prefetched-cache reuse, static-only background preparation, duplicate-request
  coalescing, and retry after prefetch failure.
- Site checks: timeout while reading JSON, in-place content retry, concurrent
  retry guard, and all nine existing editor-theme class mappings.
- Python suite: 8 passed, 3 explicitly skipped. Routes, editor/public branding,
  health, static-mode synthesis blocking, assets, speech validation and mocked
  rate limiting passed. Tests use an isolated temporary SQLite database.
- Archive CRC, duplicate-entry and path checks before delivery. Existing
  portrait/voice assets and the bundled database are unchanged from v79.

Not verified here:

- Real desktop/mobile browser layout and physical audio playback. The Chrome
  installation repeatedly timed out; no successful Playwright run is claimed.
- Three optional real Piper synthesis tests (not installed or needed for the
  default static deployment). Enable with RUN_DYNAMIC_VOICE_TESTS=1 only in a
  suitably provisioned local environment with piper-tts installed.
- Live Render deployment, RAM under production traffic, or existing hosted
  logo/database persistence.

Run from the project root:

    pip install -r requirements.txt httpx
    python -m unittest discover -s tests -v
    node tests/loader-regressions.cjs
    node tests/speech-regressions.cjs
    node tests/speech-worker-regressions.cjs
    node tests/site-reliability-regressions.cjs

Optional test-only dependencies (not required by the hosted portfolio):

    npm install --no-save @napi-rs/canvas playwright
    node tests/favicon-regressions.cjs
    npx playwright install chromium
    node tests/browser-regressions.cjs

# v79 verification

- JavaScript syntax checks passed for the loader, speech controller, speech
  worker, and main portfolio script.
- Speech-controller and loader regression suites passed.
- Worker routing verified that the default terminal narration uses
  `voice-preview.wav`, `whoami` uses `whoami-robot.wav`, and only non-static
  text attempts the dynamic endpoint.
- With `SPEECH_MODE=static`, the API reports static mode and rejects dynamic
  synthesis before Piper can load. The health endpoint and bundled narration
  remained available.
- A clean static-mode backend import used about 56 MiB maximum RSS in this
  environment and confirmed that neither `piper` nor `onnxruntime` was imported.
  This is a local verification figure, not a guarantee of Render's exact RAM.
- Archive integrity and duplicate-entry checks are performed before delivery.

# v70 verification

- Seven backend tests passed with the neural engine, including real WAV output,
  concurrent synthesis, pronunciation normalization, input/rate validation and assets.
- Speech controller tests passed, including combining multiple decoded audio
  parts into one playback source, stopping, interruption and stale responses.
- Loader tests passed. First-party JS syntax checks passed.
- Neural model assembled from four bundled parts and passed its SHA-256 check.
- Real speech generated: default profile narration 9.22 seconds of audio.
  Generation plus model loading and welcome synthesis took 2.86 seconds here;
  speech-only peak RSS was 373 MiB. A separate 500-character request took
  4.74 seconds and about 356 MiB peak RSS. Server/device results can differ.
- Physical listening and real browser layout were not verified. Previous browser
  installation failed; the included browser suite is not claimed as passed.

The older reports below describe previous release checks, not the v70 engine.

# v69 verification

Seven backend tests passed, including term pronunciation and narration-profile validation.
Speech-controller checks now also cover intact paragraph delivery and narration routing.
The existing loader checks passed. Physical listening and browser limitations below remain.

# v68 verification

The supplied logo was copied byte-for-byte and its HTML asset reference checked.
The existing loader logic regression suite passed after integration.
Real-browser and physical-phone visual checks remain unverified.

# v67 verification

The backend, speech-controller and loader checks were rerun after the v67 changes.
The welcome caption is absent from the served HTML. Browser limitations below still apply.

# v66 verification report

Completed in the build environment:

- Python backend regression suite: 6 tests passed (health/database health,
  valid WAV output, blank/oversize text rejection, speech request rate limit,
  concurrent synthesis isolation, served loader/speech assets).
- Speech controller regression suite passed using mocked browser audio/worker
  APIs: playback start/end, completion callback, stop, stale worker responses,
  interruption, errors, empty input and bounded queue.
- Loader regression suite passed using a simulated DOM: pending content keeps
  the gate closed, successful readiness releases it, failed settings/images
  keep recovery visible, timeout allows explicit Continue.
- All first-party JavaScript files passed node --check.
- Python source compiled successfully.
- Archive structure checked; no test database, credentials, virtual environment,
  cache files or experimental speech libraries are included.

Not verified here:

- Real desktop/mobile browser layout and audible playback. Browser installation
  failed with network/download errors. The included Playwright browser checks
  are a runnable follow-up suite, NOT a passed test claim.
- Real iPhone/Android audio permission behavior, physical speaker output, and
  Windows/macOS installation of the new native voice dependency.
- Live Render deployment, domain routing, GitHub scheduled workflow execution,
  external monitor configuration, production database and live editor content.

Run from the project root:

    pip install -r requirements.txt httpx
    python -m unittest discover -s tests -v
    node tests/speech-regressions.cjs
    node tests/loader-regressions.cjs

Optional browser checks (development only):

    npm install --no-save playwright
    npx playwright install chromium
    node tests/browser-regressions.cjs

The browser checks stub external fonts/icons to isolate application behavior.
They do not substitute for testing the deployed site on a real phone. Use a
local test database for all tests, never your production DATABASE_URL.

## v81 — live presence/chat + low-memory dynamic speech fallback

- PASS: `node tests/speech-regressions.cjs`
- PASS: `node tests/speech-worker-regressions.cjs`
- PASS: `node tests/site-reliability-regressions.cjs`
- PASS: `python -m unittest discover -s tests` (11 tests, 3 optional Piper tests skipped)
- PASS: static-host browser speech fallback smoke test (`NAME says. MESSAGE` as one utterance)
- PASS: presence lifecycle smoke test (join/join/leave) and SSE route registration
- NOT RUN: `tests/browser-regressions.cjs` because the Playwright Node module is not installed in this build environment.
