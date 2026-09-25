# CLAUDE.md

electrifiedhome.org: a plain-HTML information site for UK households about running a home on electricity. It embeds KarbonKit's widgets (sister repo `mikefsway/karbonkit`, checked out at `~/karbonkit`). README.md explains the layout and scripts. WRITING.md is how every page must be written: en-dashes, no marketing, no numbers that go stale. Read it before editing any page.

## What the site is for

1. Information for homeowners, written to WRITING.md.
2. KarbonKit's demo: the "Demo site" link on karbonkit.com comes here.
3. KarbonKit's only cross-site embed that we control. karbonkit.com → widgets.karbonkit.com is same-site, so it can't reproduce a customer's page. This site can, and KarbonKit's production smoke test depends on it (see Monitoring).

## Rules

- **Plain HTML, no build step, and no JavaScript of the site's own.** Mike edits it by hand. The only script that runs is KarbonKit's `embed.js`. The JSON-LD `<script type="application/ld+json">` in each page's meta block is data, not code.
- **`npm run fix` writes what search engines and LLMs read,** from each page's `<title>`, meta description, canonical link and h1. Don't edit these by hand:
  - the block between `<!-- meta:start -->` and `<!-- meta:end -->` in `<head>` (Open Graph tags, JSON-LD);
  - the `?v=` on each page's stylesheet link, a hash of `style.css`. It changes whenever the stylesheet does, which is what gets a new stylesheet past Cloudflare's cache on the custom domain;
  - `sitemap.xml`, `llms.txt` and `llms-full.txt`. The introduction to the llms files is `partials/llms.md`.
  - Keep titles under about 60 characters, in words people search for, and descriptions under 160.
- **Embed KarbonKit widgets only as KarbonKit documents them** (https://www.karbonkit.com/docs/integration.md), with the `<!-- karbonkit: TYPE -->` comment above each one.
  - Never import KarbonKit code.
  - Never add `data-` attributes the loader doesn't read.
  - Never add an SRI hash to `embed.js`, which is updated in place. The security hook will suggest one; ignore it.
  - If something needs more than the documented embed, fix KarbonKit's docs, not this site.
- **`/tools/sound-simulator/` is a plain `<iframe>` on purpose.** That keeps the iframe embed path tested. Don't convert it to the script tag.
- **Keep the CSP in `site/_headers` strict.** Allow only KarbonKit's host for scripts and frames. If a KarbonKit change needs more, that's a finding about KarbonKit: many customers' sites are this strict.
  - Leave Cloudflare Web Analytics off. The CSP would block it, and the About page says the site has no analytics.
- **Every KarbonKit widget has a page at `/tools/<slug>/`,** with the slug from https://www.karbonkit.com/widgets.json. Don't rename or remove those pages: KarbonKit's smoke test loads them.
  - The smoke test uses the first `<iframe>` on each tool page, so don't put any other iframe above the widget.
  - Each tool is listed in three places: the cards on `/tools/` and on the home page, and the footer. Each list sits between `<!-- tools:start -->` and `<!-- tools:end -->`, and `scripts/add-widgets.mjs` adds new tools to all three.
- **The site is about electrification.** Lead with heat pumps, cooking, car charging, solar and batteries, and tariffs. Insulation supports those changes; it isn't the first step.
- **The look loosely follows the Energy Saving Trust's site:** a navy band at the top of each page, then solid-colour cards. README.md has the markup.
- **The repository is public.** Keep private details out of files, commit messages and pull requests:
  - no personal email addresses or account logins. Commit as `Mike Fell <79201953+mikefsway@users.noreply.github.com>`;
  - nothing about the prompts or conversations behind a change: no Claude session links, and no quoting or describing what was asked. Say what changed and why in terms of the site.
- **After editing, run `npm run fix && npm run check`.** CI runs `check` and `check --ids` on every push.

## Config IDs

Each widget type has one config ID, used everywhere that widget appears. They live on Mike's KarbonKit account, as widget rows named "electrifiedhome.org – <type>":

- brand colour `#2458a6`;
- company name "Electrified Home";
- enquiry collection off (the site collects no contact details, and its privacy note says so);
- council link on for the grant finder.

Change settings in the KarbonKit dashboard: Your saved widgets, Edit. The ID stays the same. To swap an ID on the site, run `node scripts/site.mjs set-id <type> <id>`.

## New widgets

`.github/workflows/new-widgets.yml` runs daily. It drafts `site/tools/<slug>/` for any widget in KarbonKit's `widgets.json` that has no page yet, and opens a PR.

- The optional `CLAUDE_CODE_OAUTH_TOKEN` secret lets Claude write the page text. It wasn't set at launch, so drafts arrive with DRAFT: paragraphs, and `check` fails until they're written.
- Before merging, create the widget's config ID on the account above and `set-id` it.
- PRs opened by the bot don't trigger CI. The first human push to the branch does.

## Deploying

Cloudflare Pages builds `main`: no build command, output directory `site`. The site has been live since 2026-09-25. Every other branch gets a preview URL.

## Monitoring

KarbonKit's `prod-smoke.yml` loads every `/tools/<slug>/` page here in a real browser, every third hour and on every manual run. It fails, and opens a `prod-alert` issue in the karbonkit repo, when:

- a widget refuses to render (for example, a deleted config ID);
- a widget renders almost nothing;
- a widget is stuck on "Connecting...".

A missing page only warns. So an outage here, a broken page or a config ID change here all show up as KarbonKit alerts.
