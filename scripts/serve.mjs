#!/usr/bin/env node
// Local preview: node scripts/serve.mjs [port]
// Serves site/ the way Cloudflare Pages does (folder URLs, 404.html) and
// sends the headers from site/_headers, so the Content-Security-Policy is
// tested locally too. KarbonKit's widgets show "replace YOUR_CONFIG_ID" until
// the config IDs are in.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { SITE } from './site.mjs';

const port = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.js': 'text/javascript',
};

// Only the global "/*" block of _headers; enough for a preview.
function globalHeaders() {
  const out = {};
  let inGlobal = false;
  for (const line of readFileSync(join(SITE, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line) && !line.startsWith('#')) inGlobal = line.trim() === '/*';
    else if (inGlobal && /^\s+\S+:/.test(line)) {
      const i = line.indexOf(':');
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(SITE, path));
  if (!file.startsWith(SITE)) { res.writeHead(400).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) { res.writeHead(308, { location: path + '/' }).end(); return; }
    file = join(file, 'index.html');
  }
  let status = 200;
  if (!existsSync(file) || path.startsWith('/_')) { file = join(SITE, '404.html'); status = 404; }
  res.writeHead(status, { ...globalHeaders(), 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`http://localhost:${port}/`));
