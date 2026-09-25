# electrifiedhome.org

An information site for UK households about running a home on electricity. It embeds [KarbonKit](https://www.karbonkit.com/)'s widgets exactly as any other website would, which also makes it KarbonKit's demo and a live test of its embeds.

It is plain HTML with one stylesheet. There is no build step: what is in `site/` is what gets served.

```
site/                    everything published
  index.html             home page
  heat-pumps/index.html  one folder per page, so the URL is /heat-pumps/
  tools/<slug>/          one page per KarbonKit widget
  assets/style.css       the only stylesheet
  assets/icons/          card icons, one SVG each (style.css maps i-NAME to them)
  assets/electric-home.svg  the picture at the top of the home page
  _headers               response headers on Cloudflare (including the CSP)
  sitemap.xml            written by `npm run fix`
  llms.txt, llms-full.txt  an index and the full text of the site for LLMs, written by `npm run fix`
  assets/og.png          the picture link previews show (1200 × 630)
  apple-touch-icon.png   the icon for a phone's home screen
partials/                header and footer, copied into every page, and llms.md,
                         the introduction to llms.txt
templates/tool.html      starting point for a new widget's page
scripts/site.mjs         fix / check / set-id
scripts/add-widgets.mjs  drafts pages for new KarbonKit widgets
scripts/serve.mjs        local preview
WRITING.md               how the pages are written – read before editing
```

Needs Node 20 or later. There are no packages to install.

## Editing

1. Edit the HTML in `site/`. For the header or footer, edit `partials/` instead.
2. Run `npm run fix`. It copies the header and footer into every page, writes each page's meta block (link previews and schema.org data, from its title, description and h1), and rewrites the sitemap, `llms.txt` and `llms-full.txt`.
3. Run `npm run check`. It checks for broken links, missing titles, em-dashes, phrases WRITING.md rules out, and pages out of step with `partials/`.
4. Preview with `npm run serve` at http://localhost:8080/. The server sends the same headers as Cloudflare, so a widget blocked by the CSP shows up here too.

To add a page, copy an existing one into a new folder, change the title, description, canonical link and content, add it to the nav in `partials/header.html` if it needs to be there, and run `npm run fix`.

Every page but the home page starts with a navy band holding the h1 and lede:

```html
<div class="page-head">
<p class="eyebrow">The electric home</p>
<h1>Heat pumps</h1>
<p class="lede">...</p>
</div>
```

Lists of links become cards with `<ul class="cards">`, one `<li class="i-NAME"><a href="...">Title</a><p>Summary</p></li>` each. Add `tool-cards` for the solid-colour tool cards and `compact` for smaller ones. `i-NAME` picks an icon from `site/assets/icons/`; see the list near the end of the cards section in `style.css`. Put a section on a light background with `<div class="band">`.

## KarbonKit widgets

Each embed is pasted as KarbonKit's dashboard or docs give it, with a comment naming the widget type above it:

```html
<!-- karbonkit: grant-finder -->
<figure class="tool wide">
  <div class="tool-frame">
    <script src="https://widgets.karbonkit.com/embed.js"></script>
    <div data-karbonkit data-config-id="YOUR_CONFIG_ID"></div>
  </div>
  <figcaption>...</figcaption>
</figure>
```

The comment is how the scripts find the embed. The sound simulator page uses the plain `<iframe>` snippet instead of the script tag, so the site tests both ways of embedding.

Each widget has one config ID, created in the KarbonKit dashboard (signed in as the site's owner). To put one in everywhere that widget appears:

```
node scripts/site.mjs set-id grant-finder <CONFIG_ID>
```

`npm run check -- --ids` (and the "Every widget has its config ID" job in CI) fails while any `YOUR_CONFIG_ID` is left.

## New widgets arrive by pull request

KarbonKit publishes its shipped widgets at https://www.karbonkit.com/widgets.json. Once a day, `.github/workflows/new-widgets.yml` compares that list with `site/tools/`. For each widget that has no page yet, it:

1. drafts `site/tools/<slug>/index.html` from `templates/tool.html` and lists it on /tools/, the home page and in the footer (`check` fails if a tool page is missing from any of the three);
2. if the repository has a `CLAUDE_CODE_OAUTH_TOKEN` secret, has Claude write the page text following WRITING.md, and link to it from the most relevant topic page;
3. opens a pull request.

A person still merges it, because the page needs a config ID from the dashboard and someone should read what will be published. Widgets KarbonKit has parked (not in `widgets.json`) never appear.

You can also run it by hand from the Actions tab (New KarbonKit widgets → Run workflow).

## Deploying

Cloudflare Pages builds from `main`: no build command, output directory `site`. Every other branch gets a preview URL. Merging to `main` publishes.

## Testing the widgets

KarbonKit's production smoke test (`prod-smoke.yml` in the karbonkit repository, every third hour) opens every `/tools/<slug>/` page here in a real browser and fails if a widget doesn't render. That is the point of the site being on its own domain: an iframe from here to widgets.karbonkit.com is cross-site, like every real embedder, which pages on karbonkit.com cannot be.

So if you rename or remove a tool page, KarbonKit's monitoring will notice.
