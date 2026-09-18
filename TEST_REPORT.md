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
