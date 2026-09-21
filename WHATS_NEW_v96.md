# v96 — Google identity / search cleanup

- Corrected the accidental `Pastorfide Echanova` identity string to `P. Echanova` everywhere shipped by the portfolio.
- Added a startup migration that fixes only the exact old default in an existing database without overwriting owner-customized names.
- Reworked JSON-LD as a `ProfilePage` whose `mainEntity` is `Johndaleverth P. Echanova`.
- Added LinkedIn and GitHub identity links (`sameAs` / `rel=me`) to help entity disambiguation.
- Kept the supplied owner portrait as the fixed, crawlable favicon and profile image.
- Simplified the primary favicon declaration to one stable `/brand-icon.png` URL, while keeping `/favicon.ico` as fallback.
- Added the public profile image to crawler allowances and to the sitemap image entry.
- Updated the default page title to `Engr. Johndaleverth P. Echanova | Computer Engineer & Full-Stack Developer`.

After deployment, request re-indexing of the home page in Google Search Console. Google controls when search-result favicons and AI-generated summaries refresh; the website can supply clearer signals but cannot force an immediate display change.
