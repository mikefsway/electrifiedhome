#!/usr/bin/env node
// Drafts a page for each KarbonKit widget this site doesn't have yet.
//
//   node scripts/add-widgets.mjs --list        print the slugs of new widgets
//   node scripts/add-widgets.mjs --slug SLUG   draft the page for one of them
//
// KarbonKit publishes its shipped widgets at https://www.karbonkit.com/widgets.json
// (built from WIDGET_REFERENCE in its frontend). A widget counts as present
// here when site/tools/<slug>/index.html exists. The draft comes from
// templates/tool.html and has DRAFT: paragraphs, which fail the check until
// someone (or the Claude step in .github/workflows/new-widgets.yml) writes them.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, fix } from './site.mjs';

const URL_ = process.env.KARBONKIT_WIDGETS_URL || 'https://www.karbonkit.com/widgets.json';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function catalogue() {
  const res = await fetch(URL_, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${URL_} returned ${res.status}`);
  const data = await res.json();
  const widgets = Array.isArray(data) ? data : data.widgets;
  if (!Array.isArray(widgets) || !widgets.length) throw new Error(`${URL_} has no widgets list`);
  for (const w of widgets) {
    if (!/^[a-z0-9-]+$/.test(w.slug || '') || !/^[a-z0-9-]+$/.test(w.type || '') || !w.name) {
      throw new Error(`unexpected entry in ${URL_}: ${JSON.stringify(w)}`);
    }
  }
  return widgets;
}

const pagePath = (slug) => join(SITE, 'tools', slug, 'index.html');

function draft(w) {
  const html = readFileSync(join(ROOT, 'templates/tool.html'), 'utf8')
    .replaceAll('{{NAME}}', esc(w.name))
    .replaceAll('{{SUMMARY}}', esc(w.summary || ''))
    .replaceAll('{{SLUG}}', w.slug)
    .replaceAll('{{TYPE}}', w.type);
  mkdirSync(join(SITE, 'tools', w.slug), { recursive: true });
  writeFileSync(pagePath(w.slug), html);

  const indexFile = join(SITE, 'tools/index.html');
  const index = readFileSync(indexFile, 'utf8');
  const item = `  <li><a href="/tools/${w.slug}/">${esc(w.name)}</a><p>${esc(w.summary || '')}</p></li>\n`;
  if (!index.includes('<!-- tools:end -->')) throw new Error('site/tools/index.html has no <!-- tools:end --> marker');
  writeFileSync(indexFile, index.replace(/( *)<!-- tools:end -->/, (m, sp) => item + sp + '<!-- tools:end -->'));
  fix();
}

const args = process.argv.slice(2);
const widgets = await catalogue();
const missing = widgets.filter((w) => !existsSync(pagePath(w.slug)));

if (args[0] === '--list') {
  console.log(missing.map((w) => w.slug).join('\n'));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `slugs=${missing.map((w) => w.slug).join(' ')}\n`);
  }
} else if (args[0] === '--slug') {
  const w = missing.find((x) => x.slug === args[1]);
  if (!w) { console.error(`${args[1]} is not a new widget`); process.exit(1); }
  draft(w);
  console.log(`drafted site/tools/${w.slug}/index.html for ${w.type}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `name=${w.name}\ntype=${w.type}\n`);
  }
} else {
  console.error('usage: node scripts/add-widgets.mjs --list | --slug SLUG');
  process.exit(2);
}
