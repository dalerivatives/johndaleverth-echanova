# v83 verification

Source: the uploaded v81 realtime-chat ZIP. Tests used disposable local SQLite
databases, Python 3.12.14 and headless Chromium 153. No production data was used.

## Passed

- 90 portrait layout cases: five viewport widths (320, 390, 768, 1024, 1440),
  all nine dial themes, and both coded/photo states. Checked identical image
  frames, opacity, no horizontal page overflow, text clearance from the face,
  hair/shoulder bounds and halo presence.
- Pixel comparison at 390px in all nine themes and both states: changing a
  forced background from red to blue leaves the tested face interior unchanged.
  Original portrait geometry and original PNG bytes are retained.
- Visual inspection of captured desktop/mobile profile screenshots, including
  cyber, violet, light/monochrome and default themes.
- Rapid command switches settle to the latest requested portrait without an
  obsolete crossfade timer. No browser page exceptions in the profile matrix.
- Existing browser suite on desktop/mobile: startup, circular tab icon,
  transparent favicon corners, viewer display, no header logo, navigation,
  no horizontal overflow, welcome/Code transform/terminal audio-start events,
  cancellation and no page exceptions. Optional API failure still opens the page.
- 15 Python tests, including all three actual Piper synthesis tests: health,
  clean URLs, assets, speech validation/rate limits, voice output, concurrent
  synthesis, blank DATABASE_URL, presence join/leave/expiry, and verification
  that static startup does not import Piper or ONNX Runtime.
- Six Node suites: favicon pixels/races; loader timeout/recovery; content retry
  and editor themes; speech lifecycle/cache; worker WAV routing/deduplication;
  male-only selection, late/missing voices, mixed-engine queue and master mute.
- First-party JS syntax, CSS parsing and Python compilation.
- Archive CRC, duplicate paths, unsafe path checks and original asset checks
  performed on the final ZIP.

## Limits

This is not a guarantee of zero errors. The ZIP has not been deployed to the
user's Render service. Production load/memory, PostgreSQL connectivity, uploaded
media persistence, Safari/Firefox, physical phones and audible voice quality on
real devices were not tested. Browser audio-start events and real WAV generation
were tested; headless playback is not a listening test.

Browser speech gender is not exposed by a standard API field. This version uses
an explicit allowlist of known male English voice names and declines unknown or
female voices. Dynamic speech is unavailable on a static host when no matching
male voice is installed. The three static recordings do not have that dependency.

## Reproduce

Install requirements.txt plus httpx for Python tests. Set
RUN_DYNAMIC_VOICE_TESTS=1 to include actual local neural synthesis, then run:

`python -m unittest discover -s tests -v`

Node tests use Node, @napi-rs/canvas (favicon) and, for browser tests,
playwright plus sharp. Install Chromium with Playwright or set CHROMIUM_PATH to
an existing Chromium executable. Set PYTHON to the installed Python executable.

Run each `tests/*-regressions.cjs` from the project root. Optional SCREENSHOT_DIR
captures the profile browser images. Test-only packages and browser binaries are
not part of the deployment ZIP.
