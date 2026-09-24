# What's new

## v117 — full audit: search picture, data safety, bug fixes, clean-up

Nothing about the site's look changes except the Projects video cards (see
Performance). Your icon's address stays exactly the same
(`/brand-icon.png?v=7f493895b30c`), so Google does not have to start over.

### The picture beside your Google result

It showed you on plain white because Google picked the transparent cut-out
that the whoami reveal uses, and a search result has nothing behind a
transparent picture. Now:

- `assets/profile-photo.jpg` is your original photo: square, uncropped, with
  its backdrop, published exactly as you sent it (it carries no location or
  camera data).
- The page names it as its preferred image in its structured data
  (`primaryImageOfPage` and the Person's `image`), as Google documents.
- Every other picture in `assets/` (the cut-out, the contour mask, the share
  card, the boot logo) is sent with `X-Robots-Tag: noindex`, Google's
  documented way to keep a specific image out of Search. So the original
  photo is the only portrait Google may use.
- `max-image-preview:large` turns the thumbnail back on (v115 had switched
  it off).
- Your structured data now lists your Facebook and Instagram, taken from
  Site settings automatically, not only GitHub.

Link previews on Facebook, Messenger and the like are unchanged: they still
show the designed share card.

### Data safety

- **Uploads now survive deploys.** Item pictures and videos and the resume
  PDF were saved only on Render's disk, which is wiped on every deploy and
  restart. The database still pointed at them, so they would have become
  broken images. They are now stored in the database (new `media_assets`
  table), and the disk is only a cache that refills itself. Your live content
  uses YouTube links, so nothing was lost.
- **Emptying a section no longer brings the sample content back.** Deleting
  every heading in a section used to make the next restart re-add the demo
  entries.
- **Save settings can't wipe everything any more.** If the settings failed to
  load, pressing Save sent every field blank. Save is now refused until the
  settings have loaded.
- Saving an item without changing it no longer risks deleting its uploaded
  file. Replacing or removing a file now also deletes the stored copy.

### The robot (tested on PostgreSQL, like your Supabase database)

- **Simultaneous hits were being lost.** In a burst of 15 taps, 60–80% of the
  damage disappeared, and one kill could be counted as "destroyed" up to 11
  times (11 explosions, 11 crowns). Hits are now applied one at a time:
  exact damage, one destruction per robot.
- **The killing blow now counts.** A player whose only hit was the final one
  was never marked as having beaten the robot, and their damage leaked into
  the next round.
- A tap at the very edge of the robot's screen no longer lands in the middle.

### Live features

- Chat, the robot and the music player now react to **every** way of
  changing section. Before, arriving at the chat with the browser's Back
  button left it frozen, and leaving Tools that way left the music playing.
- After a server restart (every deploy or wake-up), the live chat and robot
  feeds resume straight away instead of staying silent.
- The faces in "N people viewing now" can no longer be faked: a name only
  shows if it really belongs to that visitor's device.

### Security

- The editor key can only be tried 10 times per 15 minutes per connection.
  The old raw-key header (no limit at all) is gone.
- A key or token containing an accented letter or emoji caused a server
  error. Now it's just "wrong key".
- Other websites can no longer call your API from their visitors' browsers
  (the wide-open CORS setting is removed; the site itself never needed it).
- Link previews can no longer be tricked into fetching internal addresses
  with a DNS trick (DNS rebinding).
- Links typed into the editor must be real web addresses: a `javascript:`
  link can't become a clickable card or social icon.
- Uploaded files and pages get protective headers (no MIME sniffing,
  sandboxed uploads, and no embedding of the editor by other sites).
- Over-long or blank headings, titles and tags now give a clear message
  instead of a server error.

### Performance

- **Projects videos load on demand.** Each YouTube card shows the video's
  thumbnail and a play button, and the full player (about 0.5–1 MB of
  YouTube's scripts per video) loads only when someone presses play.
- The whoami portrait is 40 KB instead of 436 KB (WebP, identical colours),
  and the boot logo is 30 KB instead of 80 KB.
- Returning visitors load the CSS and JS from their own cache without
  asking the server (fingerprinted files are cached for a year). A new
  deploy changes the fingerprint automatically.
- A preload that downloaded the contour image twice now downloads it once.
- On phones, the moving background no longer redraws (and jumps) every
  time the address bar slides while scrolling, and carousels no longer
  re-scroll themselves.

### Accessibility

- The theme dial and sound switch can now be reached with the Tab key.
  Before, keyboard users could never get to them.
- Tab stays inside the photo/video enlarger while it is open.

### Clean-up

- About 11 KB of CSS for controls that no longer exist (the old palette
  menu, theme cards, timeline, sound button…) is removed. It was checked by
  comparing the computed style of every element, in several themes, on
  desktop and phone, before and after: identical.
- The neural "dynamic" voice mode is removed. Its 63 MB model was never
  included in this package, so it could only fail. `SPEECH_MODE` no longer
  does anything and has been removed from the config files. The voice you
  hear is unchanged.
- Removed `tools_make_icons.py` (it pointed at a file path that only existed
  on a past build machine), `requirements-neural.txt` and `voices/`.
- Removed unused code: a startup hook FastAPI has deprecated (now a lifespan
  handler), unused variables and globals, and a no-op favicon call. Also
  fixed the footer's time-zone name (every underscore now becomes a space)
  and the console warning three.js printed on every chat visit.
- The sitemap now lists only your homepage. The section URLs still work, but
  they point Google at `/` as the main page, and listing them only produced
  "Alternate page with proper canonical tag" notices in Search Console.

### After deploying

1. Push to GitHub as usual. Render redeploys by itself.
2. Search Console → URL Inspection → `https://johndaleverthechanova.com/`
   → **Request indexing**, once.
3. Give Google a few days to two weeks. The picture on the right and the
   round icon beside your name both update on Google's own schedule.

No Cloudflare purge is needed. The new CSS and JS have new addresses, and
pages are never cached.

## v116

- robots.txt: explicit sections for Googlebot and Googlebot-Image, fixed so
  every crawler reads the rules the same way; Google may read the public
  content your page loads (`/api/settings`, `/api/content/`, `/api/github/`).
- Each icon address returns the size it declares (192, 180, 512, a real ICO).
- The icon address can't change on a deploy.

## v115

- Removed the right-side search thumbnail (reversed in v117: it now shows
  your original photo instead of the cut-out on white).
- Favicon checklist confirmed: crawlable, allowed, correctly sized, served
  directly.
