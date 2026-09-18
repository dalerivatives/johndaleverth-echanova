# v81 — Profile backdrop, halo, and Code Transform voice

This build updates the profile hero without changing the supplied portrait or coded-human assets.

- Floating code is intentionally clustered behind the hero while the Profile section is active.
- The first algorithm graph is now a tree (when tree mode is enabled) and is anchored behind the human instead of being left to random gutter placement.
- Both the coded human and the revealed photo share a soft, theme-aware halo. The halo is a separate radial layer behind the person, avoiding the cropped edge/backlight problem from older builds.
- On narrow phones the hard halo ring is removed and only the soft aura remains, preventing an edge from being cut by the viewport.
- Typing `code` (or `ascii`) after `whoami` now speaks **“Code transform”**. The phrase is bundled as a static WAV so it works even when dynamic Piper speech is disabled on low-memory hosting.
- Profile-specific code/tree accents dim automatically on other sections.
