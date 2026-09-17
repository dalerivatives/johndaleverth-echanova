# v67 update

- Typing whoami and pressing Enter reveals the portrait and speaks only:
  "Welcome to my world!"
- Removed the message box, text caption and caption waveform entirely.
- Viewer avatars are clipped to a true circle. Anonymous viewers use a solid
  theme-accent circle; registered visitors keep their circular profile image.
  Removed borders and pulsing shadows that could appear as clipped rectangles.
- Refreshed voice asset and cache versions so the older introduction is not reused.
- All other v66 features remain. See UPDATE_v66.md for installation and
  KEEP_AWAKE.md for Render/GitHub setup. No live deployment has been performed.

Validation: Python backend checks, speech-controller and loader regression suites,
and JavaScript syntax checks passed. Real-browser/phone visual and playback checks
remain unverified in this environment, as explained in TEST_REPORT.md.
