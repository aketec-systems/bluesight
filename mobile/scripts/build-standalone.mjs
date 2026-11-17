// Turns `expo export --platform web` output into ONE self-contained HTML file (script, font and
// icon inlined) — the format the shareable web preview needs. Usage:
//   npx expo export --platform web && node scripts/build-standalone.mjs dist bluesight-preview.html
import fs from 'node:fs';
import path from 'node:path';

const [dist = 'dist', out = 'bluesight-preview.html'] = process.argv.slice(2);
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const scriptTag = html.match(/<script src="([^"]+\.js)" defer><\/script>/);
if (!scriptTag) throw new Error('bundle <script> not found in index.html');
const bundle = fs.readFileSync(path.join(dist, scriptTag[1].replace(/^\//, '')), 'utf8').replace(/<\/script/gi, '<\\/script');

const fontFile = fs.readdirSync(path.join(dist, 'assets/assets/fonts')).find((f) => f.endsWith('.ttf'));
const font = fs.readFileSync(path.join(dist, 'assets/assets/fonts', fontFile)).toString('base64');
const icon = fs.readFileSync('assets/favicon.png').toString('base64');

html = html
  .replace(/^<!doctype html>/i, '<!DOCTYPE html>')
  .replace(scriptTag[0], () => `<script>window.BLS_FONT="data:font/ttf;base64,${font}";</script>\n<script>${bundle}</script>`)
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/png;base64,${icon}"/>`)
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />', '<meta name="viewport" content="width=device-width, initial-scale=1" />');

fs.writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
