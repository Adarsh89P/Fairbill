// After `expo export` for GitHub Pages: make the site an installable app (manifest, icons, offline cache,
// iPhone home-screen tags) and add a 404.html copy so deep links survive a reload.
import fs from 'node:fs';
const dir = process.argv[2] ?? 'dist-pages';
const base = process.env.EXPO_BASE_URL ?? '';
const manifest = {
  name: 'FairBill — Eat Together. Pay Fairly.',
  short_name: 'FairBill',
  description: 'Scan a restaurant bill and split it fairly, down to the paisa.',
  id: `${base}/`,
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#F6F7FB',
  theme_color: '#4F46E5',
  categories: ['finance', 'food', 'utilities'],
  icons: [
    { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(`${dir}/manifest.webmanifest`, JSON.stringify(manifest, null, 2));
const head = [
  `<link rel="manifest" href="${base}/manifest.webmanifest">`,
  `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">`,
  '<meta name="theme-color" content="#4F46E5">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="FairBill">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  `<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('${base}/sw.js',{scope:'${base}/'}).catch(function(){})})}</script>`,
].join('');
const file = `${dir}/index.html`;
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('manifest.webmanifest')) html = html.replace('</head>', `${head}</head>`);
fs.writeFileSync(file, html);
fs.copyFileSync(file, `${dir}/404.html`);
fs.writeFileSync(`${dir}/.nojekyll`, '');
console.log('Finished', dir);
