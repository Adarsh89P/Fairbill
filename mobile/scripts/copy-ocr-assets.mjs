// Copies the in-browser bill reader (Tesseract.js worker, WebAssembly core and English model) into
// public/ocr so the web build serves them itself. Run before `expo export -p web`.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'ocr');
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
copy(path.join(nm, 'tesseract.js/dist/worker.min.js'), path.join(out, 'worker.min.js'));
// LSTM-only cores (the app uses the LSTM engine): plain, SIMD and relaxed-SIMD builds; the worker picks one.
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copy(path.join(nm, 'tesseract.js-core', f), path.join(out, 'core', f));
}
// "best_int": the accurate model, quantised to ~3 MB.
copy(path.join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), path.join(out, 'lang', 'eng.traineddata.gz'));
console.log('Copied bill reader files to', path.relative(root, out));
