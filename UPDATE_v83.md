# v83 — Profile layers, theme highlights and male voices

Based on the supplied Johndaleverth_Portfolio_v81_REALTIME_CHAT_VOICE(2).zip.

- Floating code and graph trees remain behind the profile. A solid SVG
  silhouette beneath the human blocks decorations between the code glyphs and
  during the photo/code transition. It uses the original 883 x 883 coordinates.
- Both original portrait PNGs are unchanged. One responsive CSS frame replaces
  JavaScript position calculations and 46 conflicting legacy selector groups.
  The face and shoulders stay inside the hero; the lower bust meets the terminal.
- A soft halo follows the selected theme's colours. The photo has a subtle
  contour highlight. Light and monochrome themes have their own contrast rules.
- `code` (or `ascii`) says "Code transform." using the same bundled John male
  voice as the existing recordings. The short WAV is pre-generated, so Render
  does not load the neural model for this command.
- Arbitrary browser narration accepts only recognized male English voices.
  It never chooses an arbitrary/default voice. Delayed voice availability updates
  the chat control; devices with no recognized male voice get an explanation.
- Browser speech and recorded speech share one queue, preventing overlap.
  Interruptions, visibility changes and the master mute cancel current speech.
- Rapid whoami/code commands cancel the previous transition timer.
- Empty DATABASE_URL now correctly uses the local SQLite fallback instead of
  failing startup. Deployment dependencies are pinned to locally tested versions.

The v81 live viewer/chat feeds and v80 circular tab-only icon are retained.
This ZIP does not include or replace your hosted database, uploads or secrets.

## Voice limits

Static hosting uses the existing male welcome/default terminal recordings and
the new male Code transform recording. Customized narration, names and chat
messages use a recognized male voice supplied by the visitor's browser. These
voices vary by device. If none is available, dynamic speech stays off and text
remains usable. A higher-memory deployment can opt into SPEECH_MODE=dynamic
to synthesize those phrases using the bundled John voice instead.

No claim of a 100% error-free deployment is made. Read TEST_REPORT.md for the
actual verification and DEPLOY_v83.md before replacing live files.
