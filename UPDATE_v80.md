# v80 — Circular tab icon, clean viewer bar, reliability improvements

## Your logo

- Removed the uploaded site logo beside the viewer count entirely. The real
  presence avatars and viewer count are unchanged.
- Your saved upload is used only as the browser-tab icon on the public site and
  editor. A 64x64 circular PNG is generated in the visitor's browser with
  transparent corners; simply rounding an HTML image would not shape a favicon.
- Rectangular images are centre-cropped, never stretched. Original uploaded
  files, portraits and content are not modified.
- The editor preview uses the same rendered circle and now explains where the
  icon appears. Uploading or removing it updates other open tabs on the same
  browser/origin. New visitors load the current setting from the server.
- A failed image has a safe blank fallback, not a square icon or default D.

## Additional improvements

- Startup keeps hidden gallery images lazy and no longer waits for all embeds
  or voice files. Optional content has a bounded wait and the overall loader
  budget is seven seconds after the page DOM is ready. This cannot shorten a
  hosting cold start before Render serves the page.
- Missing essential CSS/main JavaScript still offers Retry or explicit Continue
  with limited functionality, instead of falsely reporting a healthy page.
- Failed Projects/Achievements/Tools requests show a section-level Retry button;
  the whole page need not be refreshed. JSON requests have timeouts and repeated
  retries cannot start duplicate concurrent requests for the same section.
- Idle voice playback preserves the prefetched worker/cache. Concurrent hover
  and click preparation now share a single WAV fetch, and failed preparation
  can be retried. Automatic prefetch remains static-only.
- Active navigation is announced to assistive technology, reduced-motion
  navigation avoids smooth scrolling, and the footer clock no longer triggers
  a screen-reader announcement every second.
- All nine existing editor themes, clean routes, portrait layers and the v79
  low-memory speech configuration are preserved.

## Deploy

1. Keep your current database, uploads, ADMIN_KEY, DATABASE_URL and other private
   configuration. Do not overwrite live content with the ZIP's sample database.
2. Update the application files, including the new `static/favicon.js`.
3. Keep `SPEECH_MODE=static` on the low-memory Render service and redeploy.
4. Hard-refresh the site and, if the browser retains an old tab icon, close and
   reopen its tab. Existing accessible logo uploads are processed automatically;
   no re-upload is required for the circular rendering.

This ZIP is an application update, not a live deployment. A Render restart can
discard uploads stored only on its ephemeral local disk; persistent storage is
a separate configuration concern and is not changed by this release.

## Voice limitations retained from v79

Static mode voices the original default terminal text and the `whoami` welcome.
It does not generate arbitrary edited terminal text or read dynamic chat aloud.
An edited terminal now explains why narration is unavailable instead of silently
doing nothing. Higher-memory deployments may opt into `SPEECH_MODE=dynamic`.

## Verification

See the v80 section of TEST_REPORT.md for checks run and limitations. The ZIP
includes a desktop/mobile Playwright suite to run in an environment with Chrome
installed; it was not run successfully in the build environment.
