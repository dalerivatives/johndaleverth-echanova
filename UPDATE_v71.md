# v71 — website logo, hacker editor, clear hero

Open the editor, choose **Site settings**, then **Website logo → Upload photo**.
PNG, JPG, WebP and ICO are accepted (5 MB, up to 16 megapixels). Uploads save
immediately. A preview appears, and **Restore default** brings back the D.
The image is fitted, without cropping, inside a transparent 128×128 PNG.
It is stored in the settings database, so it has the same persistence as your
other settings. Use the existing persistent database on deployment.
Refresh the public page after changing the logo; existing open tabs may retain
the old favicon until reloaded. The Trevelade loading-screen logo is unchanged.

The editor now has a dark green hacker-console palette, monospace controls,
subtle grid background, and visible keyboard focus indicators.

The profile reserves separate space for the identity and both figure states.
Narrow screens stack the figure below the identity. A quiet background behind
the hero prevents the floating code/graph from showing through the portrait
or coded silhouette. The figure's own code artwork remains intact.

## Install

Extract BOTH v71 packages into the same folder, merging the
Johndaleverth_Portfolio folder. These are ordinary ZIPs, not split ZIP volumes.
Keep your deployed environment variables and existing database. Reinstall
requirements.txt (Pillow was added for image validation and resizing).
Do not replace your live database with a fresh database.

## Verification

Passed isolated backend tests for authenticated image upload, PNG conversion,
public/editor favicon rendering, reset, and rejection of invalid, oversized,
and unauthenticated uploads. Existing mocked loader and speech lifecycle
regressions passed. Python and editor JavaScript syntax checks passed.
Both ZIP CRC checks and combined extraction/file comparison passed.
Browser/device visual verification was not available in this environment.
No changes were made to the neural voice, anonymous avatar, or hosting plan.
