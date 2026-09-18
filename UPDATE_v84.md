# v84 — remove circular backlight and announce round winner

Only two user-facing changes:

1. Removed the circular gradient behind both profile states. Existing contour
   highlights, original images, silhouette protection and positioning are kept.
2. On a new robot round win, the existing male voice engine announces:
   "[Name] won this round by defeating the robot!"

The name is the server's crowned round winner, using the existing leaderboard
rules. The announcement respects the sound mute and chat voice preference, queues
behind existing speech and does not replay historical wins on initial load.
Like other named speech in v83, it requires a recognized male browser voice in
static mode, or the optional male server voice on a dynamic deployment.

Verification: JavaScript syntax; targeted winner-announcement checks (initial
load, repeated results, a new round, mute, voice-off and unavailable voice);
browser check of gradient removal and portrait alignment across all nine themes;
archive integrity and comparison against v83 to limit changes to this request.

The v83 TEST_REPORT.md records the prior release's broader checks. Those checks
are historical; this patch does not claim a new full deployment or device test.
