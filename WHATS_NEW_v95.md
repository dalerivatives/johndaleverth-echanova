# Portfolio v95 — Fixed Portrait Branding

- Removed the Browser-tab icon / Upload photo section from the editor.
- Uses the supplied owner portrait as the permanent browser-tab favicon.
- Publishes real PNG/ICO icon files at stable crawlable URLs for search engines.
- Ignores any old `favicon_url` database value so legacy uploads cannot override the portrait.
- Added the supplied portrait to Open Graph/Twitter metadata and Person structured data.
- Search engines still decide when to recrawl and whether to display a favicon/image; deployment cannot force an immediate Google refresh.
