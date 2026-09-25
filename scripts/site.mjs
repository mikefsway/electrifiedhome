#!/usr/bin/env node
// Housekeeping for the site. No dependencies: plain Node 18+.
//
//   node scripts/site.mjs fix              copy partials/header.html and
//                                          partials/footer.html into every
//                                          page, and rewrite sitemap.xml
//   node scripts/site.mjs check            fail if anything is out of step
//                                          (what CI runs)
//   node scripts/site.mjs check --ids      also fail on unreplaced
//                                          YOUR_CONFIG_ID placeholders
//   node scripts/site.mjs set-id TYPE ID   put a KarbonKit config ID into
//                                          every embed of that widget type
//
// The pages are ordinary HTML. The only conventions this script relies on:
//   <!-- header:start --> ... <!-- header:end -->   (replaced by `fix`)
//   <!-- footer:start --> ... <!-- footer:end -->
//   <!-- karbonkit: TYPE -->                       (just above each embed,
//                                                    script tag or iframe)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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

function withLayout(html, path) {
  return html
    .replace(/<!-- header:start -->[\s\S]*?<!-- header:end -->/,
      `<!-- header:start -->\n${renderHeader(path)}\n<!-- header:end -->`)
    .replace(/<!-- footer:start -->[\s\S]*?<!-- footer:end -->/,
      `<!-- footer:start -->\n${renderFooter()}\n<!-- footer:end -->`);
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
  writeFileSync(join(SITE, 'sitemap.xml'), sitemap());
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
    } else if (withLayout(html, path) !== html) {
      say(file, 'header or footer differs from partials/ (run: node scripts/site.mjs fix)');
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

  if (read(join(SITE, 'sitemap.xml')) !== sitemap()) {
    problems.push('site/sitemap.xml is out of date (run: node scripts/site.mjs fix)');
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
