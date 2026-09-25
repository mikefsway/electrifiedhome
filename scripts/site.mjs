#!/usr/bin/env node
// Housekeeping for the site. No dependencies: plain Node 18+.
//
//   node scripts/site.mjs fix              copy partials/header.html and
//                                          partials/footer.html into every
//                                          page, write each page's meta
//                                          block, and rewrite sitemap.xml,
//                                          llms.txt and llms-full.txt
//   node scripts/site.mjs check            fail if anything is out of step
//                                          (what CI runs)
//   node scripts/site.mjs check --ids      also fail on unreplaced
//                                          YOUR_CONFIG_ID placeholders
//   node scripts/site.mjs set-id TYPE ID   put a KarbonKit config ID into
//                                          every embed of that widget type
//
// The pages are ordinary HTML. The only conventions this script relies on:
//   <!-- meta:start --> ... <!-- meta:end -->       (replaced by `fix`;
//                                                    added if missing)
//   <!-- header:start --> ... <!-- header:end -->   (replaced by `fix`)
//   <!-- footer:start --> ... <!-- footer:end -->
//   <!-- karbonkit: TYPE -->                       (just above each embed,
//                                                    script tag or iframe)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SITE = join(ROOT, 'site');
export const ORIGIN = 'https://electrifiedhome.org';
export const PLACEHOLDER = 'YOUR_CONFIG_ID';

// Words and phrases WRITING.md rules out. Matched case-insensitively
// against the visible text of every page.
const BANNED = [
  'seamless', 'seamlessly', 'unlock', 'unlocks', 'empower', 'empowers',
  'journey', 'delve', 'game-changer', 'game changer', 'revolutionary',
  'revolutionise', 'cutting-edge', 'cutting edge', 'in today\'s',
  'whether you\'re', 'look no further', 'navigate the', 'landscape of',
  'harness the', 'supercharge', 'effortless', 'effortlessly', 'robust',
  'dive into', 'deep dive', 'it\'s worth noting', 'at the end of the day',
  'elevate', 'transformative', 'hassle-free', 'peace of mind',
];

export function pages(dir = SITE) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out.sort();
}

// /heat-pumps/index.html -> /heat-pumps/ ; /404.html -> /404.html
export function urlPath(file) {
  const rel = '/' + relative(SITE, file).split(sep).join('/');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
}

const read = (p) => readFileSync(p, 'utf8');

function renderHeader(path) {
  const header = read(join(ROOT, 'partials/header.html')).trimEnd();
  // Mark the nav link for the section this page is in.
  return header.replace(/<a href="(\/[^"]*)">/g, (m, href) =>
    href !== '/' && path.startsWith(href) ? `<a href="${href}" aria-current="page">` : m);
}

function renderFooter() {
  return read(join(ROOT, 'partials/footer.html')).trimEnd();
}

// ---------- What search engines, link previews and LLMs read ----------
//
// Each page's <head> ends with a block between <!-- meta:start --> and
// <!-- meta:end -->, written by `fix` from the page's own <title>, meta
// description, canonical link and h1: Open Graph tags for link previews, and
// schema.org JSON-LD. The JSON-LD <script> is data, not code: browsers don't
// run it and the CSP doesn't apply to it.

const SITE_NAME = 'Electrified Home';
const PUBLISHER = { '@type': 'Organization', '@id': `${ORIGIN}/#publisher`, name: 'KarbonKit', url: 'https://www.karbonkit.com/' };

const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function pageInfo(html) {
  const pick = (re) => { const m = html.match(re); return m ? decode(m[1]).trim() : ''; };
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)">/),
    h1: pick(/<h1>([^<]*)<\/h1>/),
  };
}

function jsonLd(path, info) {
  const url = ORIGIN + path;
  const website = { '@id': `${ORIGIN}/#website` };
  if (path === '/') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, url, name: SITE_NAME, description: info.description,
          inLanguage: 'en-GB', publisher: { '@id': PUBLISHER['@id'] } },
        PUBLISHER,
      ],
    };
  }
  const crumbs = [{ name: SITE_NAME, url: `${ORIGIN}/` }];
  if (path.startsWith('/tools/') && path !== '/tools/') crumbs.push({ name: 'Tools', url: `${ORIGIN}/tools/` });
  crumbs.push({ name: info.h1, url });
  const page = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    name: info.h1,
    description: info.description,
    inLanguage: 'en-GB',
    isPartOf: { ...website, '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
    },
  };
  // A tool page is about a free web app that runs in the page.
  if (crumbs.length === 3) {
    page.mainEntity = {
      '@type': 'WebApplication',
      name: info.h1,
      description: info.description,
      url,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
      provider: PUBLISHER,
    };
  }
  return page;
}

function renderMeta(path, html) {
  const info = pageInfo(html);
  const lines = [
    '<meta name="theme-color" content="#14365f">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="preload" href="/assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>',
  ];
  if (!path.endsWith('/')) {
    // 404.html: nothing to index or preview.
    lines.push('<meta name="robots" content="noindex">');
    return lines.join('\n');
  }
  const ogTitle = info.title.replace(/ – Electrified Home$/, '');
  lines.push(
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    '<meta property="og:locale" content="en_GB">',
    `<meta property="og:title" content="${attr(ogTitle)}">`,
    `<meta property="og:description" content="${attr(info.description)}">`,
    `<meta property="og:url" content="${ORIGIN}${path}">`,
    `<meta property="og:image" content="${ORIGIN}/assets/og.png">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Electrified Home: a house with solar panels, a heat pump, a battery and an electric car charging.">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json">${JSON.stringify(jsonLd(path, info)).replace(/</g, '\\u003c')}</script>`,
  );
  return lines.join('\n');
}

// The stylesheet's URL carries a hash of its contents, so a changed
// stylesheet has a new URL and no cache can serve the old one. Cloudflare's
// zone settings override the no-cache rule in _headers on the custom domain,
// so the URL is what makes a change show up straight away.
function styleHref() {
  const hash = createHash('sha256').update(read(join(SITE, 'assets/style.css'))).digest('hex').slice(0, 10);
  return `/assets/style.css?v=${hash}`;
}

function withLayout(html, path) {
  // Pages from before the meta block get its markers just before </head>.
  if (!html.includes('<!-- meta:start -->')) {
    html = html.replace('</head>', '<!-- meta:start -->\n<!-- meta:end -->\n</head>');
  }
  return html
    .replace(/href="\/assets\/style\.css(?:\?v=[0-9a-f]*)?"/, () => `href="${styleHref()}"`)
    .replace(/<!-- meta:start -->[\s\S]*?<!-- meta:end -->/,
      () => `<!-- meta:start -->\n${renderMeta(path, html)}\n<!-- meta:end -->`)
    .replace(/<!-- header:start -->[\s\S]*?<!-- header:end -->/,
      () => `<!-- header:start -->\n${renderHeader(path)}\n<!-- header:end -->`)
    .replace(/<!-- footer:start -->[\s\S]*?<!-- footer:end -->/,
      () => `<!-- footer:start -->\n${renderFooter()}\n<!-- footer:end -->`);
}

// ---------- llms.txt and llms-full.txt ----------
//
// https://llmstxt.org/: a Markdown index of the site for language models,
// and the text of every page in one file. Both are written by `fix` from the
// pages, with the introduction from partials/llms.md.

// Pages in the order a reader would want them: the footer's links first
// (topics, then tools, then the rest), then anything the footer misses.
function orderedPages() {
  const all = pages().filter((f) => urlPath(f).endsWith('/'));
  const byPath = new Map(all.map((f) => [urlPath(f), f]));
  const order = ['/'];
  for (const m of read(join(ROOT, 'partials/footer.html')).matchAll(/href="(\/[^"#]*)"/g)) {
    if (byPath.has(m[1]) && !order.includes(m[1])) order.push(m[1]);
  }
  for (const p of [...byPath.keys()].sort()) if (!order.includes(p)) order.push(p);
  return order.map((p) => ({ path: p, file: byPath.get(p) }));
}

const abs = (href, path) =>
  href.startsWith('/') ? ORIGIN + href : href.startsWith('#') ? ORIGIN + path + href : href;

function inline(html, path) {
  return decode(html
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (m, href, text) => `[${text.trim()}](${abs(href, path)})`)
    .replace(/<\/?strong>/g, '**')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' '))
    .trim();
}

// The Markdown of a page's <main>. Handles the handful of tags these pages use.
export function markdown(html, path) {
  let s = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  s = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<p class="(?:eyebrow|hero-actions)">[\s\S]*?<\/p>/g, '')
    .replace(/<img [^>]*>/g, '')
    // An embedded tool: say it's there and where to use it.
    .replace(/<figure[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>\s*<\/figure>/g, (m, cap) =>
      `\n\n*Interactive tool: ${inline(cap, path)} Use it at ${ORIGIN}${path}*\n\n`)
    // Big links with a heading inside (the home page's .split).
    .replace(/<a href="([^"]*)">\s*<h2>([\s\S]*?)<\/h2>\s*<p>([\s\S]*?)<\/p>\s*<\/a>/g, (m, href, h, p) =>
      `\n- [${inline(h, path)}](${abs(href, path)}): ${inline(p, path)}`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (m, li) => {
      li = li
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '<strong>$1</strong> ')
        .replace(/<p class="needs">([\s\S]*?)<\/p>/g, ' ($1)')
        .replace(/^\s*(<a [^>]*>[\s\S]*?<\/a>)\s*<p[^>]*>/, '$1: <p>')
        .replace(/<\/p>\s*<p[^>]*>/g, ' ');
      return `\n- ${inline(li, path)}`;
    })
    .replace(/<\/?(?:ul|ol)[^>]*>/g, '\n\n')
    .replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g, (m, n, h) => `\n\n${'#'.repeat(Number(n))} ${inline(h, path)}\n\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (m, p) => `\n\n${inline(p, path)}\n\n`)
    .replace(/<[^>]+>/g, '');
  return decode(s)
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // List items on consecutive lines, not separated by blank ones.
    .replace(/^(- .*)\n\n(?=- )/gm, '$1\n')
    .trim();
}

function llmsTxt() {
  const intro = read(join(ROOT, 'partials/llms.md')).trim();
  const sections = { guides: [], tools: [], other: [] };
  for (const { path, file } of orderedPages()) {
    if (path === '/') continue;
    const info = pageInfo(read(file));
    const line = `- [${info.h1}](${ORIGIN}${path}): ${info.description}`;
    if (path === '/tools/') sections.tools.unshift(line);
    else if (path.startsWith('/tools/')) sections.tools.push(line);
    else if (path === '/about/') sections.other.push(line);
    else sections.guides.push(line);
  }
  sections.other.push(`- [Every page in one file](${ORIGIN}/llms-full.txt): the text of all the pages above, in Markdown`);
  return `${intro}\n\n## Guides\n\n${sections.guides.join('\n')}\n\n## Tools\n\n${sections.tools.join('\n')}\n\n## Optional\n\n${sections.other.join('\n')}\n`;
}

function llmsFullTxt() {
  const intro = read(join(ROOT, 'partials/llms.md')).trim();
  const parts = orderedPages().map(({ path, file }) =>
    markdown(read(file), path).replace(/^# (.*)$/m, (m, h) => `# ${h}\n\nSource: ${ORIGIN}${path}`));
  return `${intro}\n\n${parts.join('\n\n---\n\n')}\n`;
}

// Everything `fix` writes that isn't a page.
function generated() {
  return {
    'sitemap.xml': sitemap(),
    'llms.txt': llmsTxt(),
    'llms-full.txt': llmsFullTxt(),
  };
}

function sitemap() {
  const urls = pages()
    .map(urlPath)
    .filter((p) => p.endsWith('/'))
    .map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function fix() {
  for (const file of pages()) {
    const html = read(file);
    const next = withLayout(html, urlPath(file));
    if (next !== html) writeFileSync(file, next);
  }
  for (const [name, text] of Object.entries(generated())) writeFileSync(join(SITE, name), text);
}

// Every KarbonKit embed on the site: { file, type, id }.
export function embeds() {
  const out = [];
  for (const file of pages()) {
    // The config ID is in data-config-id (script tag) or cid= (plain iframe).
    const re = /<!-- karbonkit: ([a-z0-9-]+) -->[\s\S]*?(?:data-config-id="|[?&](?:amp;)?cid=)([^"&]*)/g;
    for (const m of read(file).matchAll(re)) out.push({ file, type: m[1], id: m[2] });
  }
  return out;
}

function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function check({ ids = false } = {}) {
  const problems = [];
  const say = (file, msg) => problems.push(`${relative(ROOT, file)}: ${msg}`);

  for (const file of pages()) {
    const html = read(file);
    const path = urlPath(file);

    if (!html.includes('<!-- header:start -->') || !html.includes('<!-- footer:start -->')) {
      say(file, 'missing the header:start or footer:start marker');
    } else if (!html.includes('<!-- meta:start -->')) {
      say(file, 'missing the meta block in <head> (run: node scripts/site.mjs fix)');
    } else if (withLayout(html, path) !== html) {
      say(file, 'stylesheet link, meta block, header or footer out of date (run: node scripts/site.mjs fix)');
    }
    if (!/<title>[^<]+<\/title>/.test(html)) say(file, 'no <title>');
    if ((html.match(/<main[ >]/g) || []).length !== 1) say(file, 'should have exactly one <main>');
    if ((html.match(/<h1[ >]/g) || []).length !== 1) say(file, 'should have exactly one <h1>');
    if (!/<meta name="description" content="[^"]+">/.test(html)) say(file, 'no meta description');
    if (path.endsWith('/')) {
      const canonical = `<link rel="canonical" href="${ORIGIN}${path}">`;
      if (!html.includes(canonical)) say(file, `canonical should be ${ORIGIN}${path}`);
    }

    // Internal links must point at a page that exists.
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const target = m[1];
      const onDisk = target.endsWith('/') ? join(SITE, target, 'index.html') : join(SITE, target);
      if (!existsSync(onDisk)) say(file, `broken link ${target}`);
    }

    const text = visibleText(html);
    if (text.includes('DRAFT:')) say(file, 'still has DRAFT: text from templates/tool.html');
    if (text.includes('—')) say(file, 'em-dash in visible text (use a spaced en-dash: " – ")');
    const lower = text.toLowerCase();
    for (const phrase of BANNED) {
      const re = new RegExp(`(^|[^a-z])${phrase.replace(/[-']/g, '[-’\']')}([^a-z]|$)`);
      if (re.test(lower)) say(file, `"${phrase}" – see WRITING.md`);
    }
  }

  // One config ID per widget type, used everywhere that widget appears.
  const byType = new Map();
  for (const e of embeds()) {
    if (!byType.has(e.type)) byType.set(e.type, new Set());
    byType.get(e.type).add(e.id);
    if (e.id !== PLACEHOLDER && !/^[A-Za-z0-9_-]{18,64}$/.test(e.id)) {
      say(e.file, `config ID for ${e.type} does not look like one the dashboard issues: ${e.id}`);
    }
    if (ids && e.id === PLACEHOLDER) {
      say(e.file, `${e.type} still has ${PLACEHOLDER} (node scripts/site.mjs set-id ${e.type} <ID>)`);
    }
  }
  for (const [type, set] of byType) {
    if (set.size > 1) problems.push(`${type} uses different config IDs on different pages: ${[...set].join(', ')}`);
  }

  // Every tool page is listed on /tools/, the home page and in the footer,
  // and embeds its widget.
  const toolsIndex = read(join(SITE, 'tools/index.html'));
  const home = read(join(SITE, 'index.html'));
  const footer = read(join(ROOT, 'partials/footer.html'));
  for (const file of pages(join(SITE, 'tools'))) {
    const path = urlPath(file);
    if (path === '/tools/') continue;
    if (!toolsIndex.includes(`href="${path}"`)) say(file, 'not listed on /tools/');
    if (!home.includes(`href="${path}"`)) say(file, 'not listed on the home page');
    if (!footer.includes(`href="${path}"`)) say(file, 'not listed in partials/footer.html');
    if (!read(file).includes('<!-- karbonkit: ')) say(file, 'tool page without a KarbonKit embed');
  }

  for (const [name, text] of Object.entries(generated())) {
    const file = join(SITE, name);
    if (!existsSync(file) || read(file) !== text) {
      problems.push(`site/${name} is out of date (run: node scripts/site.mjs fix)`);
    }
  }
  return problems;
}

export function setId(type, id) {
  if (!/^[A-Za-z0-9_-]{18,64}$/.test(id || '')) throw new Error(`not a config ID: ${id}`);
  let count = 0;
  for (const file of pages()) {
    const html = read(file);
    const re = new RegExp(`(<!-- karbonkit: ${type} -->[\\s\\S]*?(?:data-config-id="|[?&](?:amp;)?cid=))[^"&]*`, 'g');
    const next = html.replace(re, (m, a) => { count++; return a + id; });
    if (next !== html) writeFileSync(file, next);
  }
  return count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'fix') {
    fix();
    console.log('layout and sitemap updated');
  } else if (cmd === 'check') {
    const problems = check({ ids: args.includes('--ids') });
    for (const p of problems) console.log(p);
    if (problems.length) process.exit(1);
    console.log(`ok: ${pages().length} pages, ${embeds().length} embeds`);
  } else if (cmd === 'set-id') {
    const n = setId(args[0], args[1]);
    if (!n) { console.error(`no embeds of type ${args[0]} found`); process.exit(1); }
    console.log(`set ${n} embed(s) of ${args[0]}`);
  } else {
    console.error('usage: node scripts/site.mjs fix | check [--ids] | set-id TYPE ID');
    process.exit(2);
  }
}
