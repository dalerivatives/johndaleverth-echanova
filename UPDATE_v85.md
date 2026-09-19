# v85 verification and changes

- Removed CSS decorative gradients across the public site, loader and editor.
- Painted the original coded-human alpha mask with the current theme accent;
  preserved the photograph, portrait silhouette, layout and backdrop layering.
- Only a real photo-to-code transition announces "Code transform."
- Mobile audio is unlocked from capture-phase touch/pointer/key gestures.
  Arbitrary chat speech uses bounded, serialized eSpeak NG male m3 synthesis
  in the default static hosting mode. Existing prerecorded male audio remains.
  Piper/ONNX is not loaded in this mode. OS male voice selection is a fallback.
- Low-memory/core devices, smaller touch screens, data-saving and reduced-motion
  users receive fewer static decorative snippets/trees and the existing playable
  2D robot. Other devices use capped background/3D frame rates and pixel ratio.
  Hidden pages pause decorative work; the 3D renderer pauses outside its view.
- Kept the previous round-winner announcement and circular tab-only logo.

## Checks performed

- Python: 14 passed; 3 optional neural-model checks skipped because the default
  deployment intentionally does not use that model. Included actual WAV output,
  concurrent requests, and no Piper/ONNX imports during lightweight synthesis.
- Profile browser suite: nine themes at 320, 390, 768, 1024 and 1440 pixels,
  both portrait states, matching frames, no horizontal overflow, backdrop pixel
  occlusion, fast switching, and no JavaScript exceptions.
- Desktop/mobile browser suite: startup, favicon shape, viewer count, voice
  commands/narration, cancellation and API-failure fallback.
- v85 browser suite: actual server audio after touch unlock with zero installed
  browser voices, repeated code command suppression, theme mask/accent match,
  no computed gradient backgrounds, and static low-end decorations.
- Speech, speech worker and male-voice unit suites passed.

Browser checks used headless Chromium with mobile emulation, not a physical
phone. Check sound on your phone after deploying and tapping the voice control.
A user gesture remains necessary under browser autoplay rules. These checks
cannot guarantee zero errors on every device or hosting configuration.

Deployment instructions: DEPLOY_v85.md. Install the updated requirements and
retain SPEECH_MODE=static on the existing memory-constrained Render service.
