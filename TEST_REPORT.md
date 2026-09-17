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
