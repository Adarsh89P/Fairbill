// Builds one self-contained HTML page of the web app (all JS inlined, images as data URIs),
// for hosts that can only show a single file, such as a Claude artifact.
// Usage: npx expo export -p web --output-dir dist && node scripts/build-artifact.mjs dist artifact/fairbill.html
import fs from 'node:fs';
import path from 'node:path';

const [dist = 'dist', out = 'artifact/fairbill.html'] = process.argv.slice(2);
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const srcs = [...index.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
let js = srcs.map((s) => fs.readFileSync(path.join(dist, s), 'utf8')).join(';\n');

js = js.replace(/"(\/assets\/[^"]+\.(png|jpg|jpeg|gif|webp))"/g, (_, p, ext) => {
  const file = path.join(dist, p);
  if (!fs.existsSync(file)) return `"${p}"`;
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `"data:image/${mime};base64,${fs.readFileSync(file).toString('base64')}"`;
});
const leftovers = [...new Set([...js.matchAll(/"\/(_expo|assets)\/[^"]+"/g)].map((m) => m[0]))];
if (leftovers.length) console.warn('Warning: unresolved file references:', leftovers.slice(0, 5));
js = js.replace(/<\/script/gi, '<\\/script');

const html = `<title>FairBill</title>
<style>
  :root { --bg: #F5F7F6; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0A110E; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #0A110E; color-scheme: dark; }
  html, body { height: 100%; }
  body { background: var(--bg); overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>
  // The app routes on the URL path; start at "/" whatever path the host serves this page from.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/' + location.hash); } catch (e) {}
</script>
<script>
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
