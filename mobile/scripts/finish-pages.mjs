// After `expo export` for GitHub Pages: add the home-screen icon link and a 404.html copy (deep links survive a reload).
import fs from 'node:fs';
const dir = process.argv[2] ?? 'dist-pages';
const base = process.env.EXPO_BASE_URL ?? '';
const file = `${dir}/index.html`;
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('apple-touch-icon')) {
  html = html.replace('</head>', `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png"><meta name="theme-color" content="#4F46E5"></head>`);
}
fs.writeFileSync(file, html);
fs.copyFileSync(file, `${dir}/404.html`);
fs.writeFileSync(`${dir}/.nojekyll`, '');
console.log('Finished', dir);
