# CLAUDE.md

electrifiedhome.org: a plain-HTML information site for UK homeowners that embeds KarbonKit's widgets. README.md explains the layout and scripts; WRITING.md is how every page must be written (en-dashes, no marketing, no numbers that go stale).

- Keep it plain HTML with no build step and no JavaScript of the site's own. Mike edits it by hand.
- Embed KarbonKit widgets only as KarbonKit documents them (https://www.karbonkit.com/docs/integration.md), with the `<!-- karbonkit: TYPE -->` comment above. Never import KarbonKit code, never add attributes the loader doesn't read, never add an SRI hash to embed.js (it is updated in place). If something needs more than the documented embed, that's a gap in KarbonKit's docs.
- Every KarbonKit widget has a page at `/tools/<slug>/`, which KarbonKit's hourly smoke test loads. Don't rename or remove those pages.
- After editing: `npm run fix && npm run check`.
