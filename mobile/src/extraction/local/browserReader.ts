/**
 * Reads a bill photo in the browser with Tesseract.js, so the web app can scan bills without a server.
 * Pipeline (same as the server's): photo checks -> clean-up -> OCR -> lines -> parse -> validate.
 *
 * To read difficult photos better it can make up to three attempts and keeps the best one:
 *   1. contrast-stretched greyscale (clear, printed bills)
 *   2. adaptive black & white (shadows, creases, faded thermal paper, photos of screens)
 *   3. the photo turned 90° either way, when almost nothing was read (sideways photos)
 *
 * The reader's files (~7 MB) are served from this site under ocr/ and cached by the browser after the
 * first download. They start downloading as soon as the user taps Scan/Upload, while the camera is open.
 */
import type { BoundingBox, ExtractionResult, ImageQuality } from '../types';
import { assembleLines } from './lines';
import { isMissing, OcrWord } from './model';
import { parseReceipt } from './parser';
import { validateReceipt } from './validator';

export class LocalScanError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface ScanProgress {
  /** Short, user-facing description of the current step. */
  step: string;
  /** 0..1 for the current step, when known. */
  progress?: number;
}

type Worker = { recognize: (img: HTMLCanvasElement, opts?: object, output?: object) => Promise<{ data: any }>; setParameters: (p: Record<string, string>) => Promise<unknown>; terminate: () => Promise<unknown> };

let workerPromise: Promise<Worker> | null = null;
let onProgress: ((p: ScanProgress) => void) | null = null;

/** Where the app is served from ("" at a domain root, "/Fairbill" on GitHub Pages). */
function appBase(): string {
  const src = document.querySelector('script[src*="/_expo/"]')?.getAttribute('src') ?? '';
  const i = src.indexOf('/_expo/');
  return i > 0 ? src.slice(0, i) : '';
}

function abs(path: string): string {
  return new URL(appBase() + path, window.location.href).href;
}

/** True when this build ships the reader's files (not in the single-file preview). */
export function localReaderAvailable(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('script[src*="/_expo/"]') && typeof WebAssembly !== 'undefined';
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = (await createWorker('eng', 1 /* LSTM only: smaller and more accurate */, {
        workerPath: abs('/ocr/worker.min.js'),
        corePath: abs('/ocr/core'),
        langPath: abs('/ocr/lang'),
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          if (!onProgress) return;
          if (m.status === 'recognizing text') onProgress({ step: 'Reading text', progress: m.progress });
          else if (/load|download|initializ/i.test(m.status)) onProgress({ step: 'Getting the bill reader ready (first time only)', progress: m.progress });
        },
      })) as unknown as Worker;
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return worker;
    })();
    workerPromise.catch(() => {
      workerPromise = null; // let the next scan try again (e.g. after a network blip)
    });
  }
  return workerPromise;
}

/**
 * Starts downloading the reader in the background (e.g. while the camera is open).
 * Errors are ignored here; a scan reports them.
 */
export function warmUpLocalReader(): void {
  if (!localReaderAvailable()) return;
  getWorker().catch(() => {});
}

// ------------------------------------------------------------------ image helpers

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LocalScanError('UNREADABLE_IMAGE', 'This file could not be opened as an image. Please use a JPG or PNG photo of the bill.'));
    img.src = uri;
  });
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

/** Greyscale values (0..255) of a canvas. */
function grey(c: HTMLCanvasElement): Uint8ClampedArray {
  const { data } = ctx2d(c).getImageData(0, 0, c.width, c.height);
  const g = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  return g;
}

function putGrey(c: HTMLCanvasElement, g: Uint8ClampedArray) {
  const ctx = ctx2d(c);
  const img = ctx.createImageData(c.width, c.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g[j];
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Same checks and thresholds as the server's ImageQualityChecker. */
function checkQuality(img: HTMLImageElement): ImageQuality {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const issues: string[] = [];
  if (Math.min(w, h) < 400) issues.push('LOW_RESOLUTION');
  const sw = Math.min(1000, w);
  const c = canvasOf(sw, (h * sw) / w);
  ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
  const g = grey(c);
  let sum = 0;
  for (const v of g) sum += v;
  const brightness = g.length ? sum / g.length : 0;
  let s = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < c.height - 1; y++) {
    for (let x = 1; x < c.width - 1; x++) {
      const i = y * c.width + x;
      const lap = g[i - c.width] + g[i + c.width] + g[i - 1] + g[i + 1] - 4 * g[i];
      s += lap;
      sq += lap * lap;
      n++;
    }
  }
  const sharpness = n ? sq / n - (s / n) ** 2 : 0;
  if (sharpness < 45) issues.push('BLURRY');
  if (brightness < 60) issues.push('TOO_DARK');
  if (brightness > 245) issues.push('OVEREXPOSED');
  return {
    acceptable: !issues.includes('LOW_RESOLUTION') && sharpness >= 22.5,
    width: w, height: h,
    sharpness: Math.round(sharpness * 10) / 10,
    brightness: Math.round(brightness * 10) / 10,
    issues,
  };
}

/**
 * Scales the photo to a size Tesseract reads well (small photos up, big ones down so slower phones cope),
 * then stretches the contrast. Returns the canvas and the scale used.
 */
function prepared(img: HTMLImageElement): { canvas: HTMLCanvasElement; scale: number; g: Uint8ClampedArray } {
  const w = img.naturalWidth;
  const target = w < 1400 ? 1800 : Math.min(w, 2000);
  const scale = target / w;
  const c = canvasOf(target, img.naturalHeight * scale);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const g = grey(c);
  // Contrast stretch between the 1st and 99th percentile.
  const hist = new Uint32Array(256);
  for (const v of g) hist[v]++;
  const lowCut = g.length * 0.01;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < lowCut; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < lowCut; hi--);
  if (hi - lo > 20) {
    const k = 255 / (hi - lo);
    for (let i = 0; i < g.length; i++) g[i] = (g[i] - lo) * k;
  }
  putGrey(c, g);
  return { canvas: c, scale, g };
}

/**
 * Adaptive black & white (Bradley's method on an integral image): each pixel is compared with the mean
 * of its neighbourhood, so shadows, creases and uneven light don't swallow the text. A light blur first
 * removes the stripe patterns you get when photographing a screen.
 */
function binarized(src: HTMLCanvasElement, g0: Uint8ClampedArray): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const g = new Uint8ClampedArray(g0.length);
  // 3x3 box blur
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += g0[yy * w + xx];
          n++;
        }
      }
      g[y * w + x] = s / n;
    }
  }
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += g[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const r = Math.max(8, Math.round(w / 32));
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - r);
    const y2 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - r);
      const x2 = Math.min(w, x + r + 1);
      const area = (x2 - x1) * (y2 - y1);
      const sum = integral[y2 * (w + 1) + x2] - integral[y1 * (w + 1) + x2] - integral[y2 * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
      out[y * w + x] = g[y * w + x] * area < sum * 0.85 ? 0 : 255;
    }
  }
  const c = canvasOf(w, h);
  putGrey(c, out);
  return c;
}

/** Rotates a canvas clockwise by 90 or 270 degrees. */
function rotated(src: HTMLCanvasElement, deg: 90 | 270): HTMLCanvasElement {
  const c = canvasOf(src.height, src.width);
  const ctx = ctx2d(c);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Maps a box from the processed image (scaled, then rotated clockwise) back to the photo. Port of TesseractOcrEngine.toInput. */
export function toInput(b: BoundingBox, rotation: number, w: number, h: number, scale: number): BoundingBox {
  const x1 = b.x;
  const y1 = b.y;
  const x2 = b.x + b.width;
  const y2 = b.y + b.height;
  let ax = x1, ay = y1, bx = x2, by = y2;
  switch (((rotation % 360) + 360) % 360) {
    case 90: ax = y1; ay = h - x2; bx = y2; by = h - x1; break;
    case 180: ax = w - x2; ay = h - y2; bx = w - x1; by = h - y1; break;
    case 270: ax = w - y2; ay = x1; bx = w - y1; by = x2; break;
  }
  const x = Math.floor(Math.min(ax, bx) / scale);
  const y = Math.floor(Math.min(ay, by) / scale);
  const r = Math.ceil(Math.max(ax, bx) / scale);
  const btm = Math.ceil(Math.max(ay, by) / scale);
  return { x, y, width: Math.max(1, r - x), height: Math.max(1, btm - y) };
}

// ------------------------------------------------------------------ OCR

/** Median tilt (dy/dx) of the text lines Tesseract found, from their baselines. 0 when unknown. */
function textSlope(data: any): number {
  const slopes: number[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    const bl = l.baseline;
    if (!bl || bl.has_baseline === false) continue;
    const dx = bl.x1 - bl.x0;
    if (dx > 80) slopes.push((bl.y1 - bl.y0) / dx);
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  const m = slopes[Math.floor(slopes.length / 2)];
  return Math.abs(m) < 0.2 ? m : 0; // ignore nonsense (more than ~11°)
}

function wordsOf(data: any): OcrWord[] {
  const out: OcrWord[] = [];
  const push = (w: any) => {
    const text = String(w.text ?? '').trim();
    if (!text || w.confidence < 0) return;
    out.push({ text, confidence: w.confidence / 100, box: { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 } });
  };
  if (Array.isArray(data.words)) data.words.forEach(push);
  else for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) for (const w of l.words ?? []) push(w);
  return out;
}

/** How useful a reading is: found amounts, items and totals count; low confidence counts against it. */
function score(r: ExtractionResult, words: OcrWord[]): number {
  const conf = words.length ? words.reduce((a, w) => a + w.confidence, 0) / words.length : 0;
  const amounts = r.items.filter((i) => !isMissing(i.amount)).length + r.charges.filter((c) => !isMissing(c.amount)).length;
  return amounts * 2 + (isMissing(r.total) ? 0 : 6) + (r.total.status === 'ok' ? 3 : 0) + (isMissing(r.subtotal) ? 0 : 2)
    + conf * 10 - r.uncertainFields.length * 0.5;
}

/** Good enough to stop trying other versions of the photo. */
function goodEnough(r: ExtractionResult): boolean {
  return !isMissing(r.total) && r.items.length > 0 && r.uncertainFields.length <= 2 && r.missingFields.filter((f) => f !== 'billNumber').length <= 1;
}

export async function scanBillLocally(photoUri: string, progress?: (p: ScanProgress) => void): Promise<ExtractionResult> {
  if (!localReaderAvailable()) {
    throw new LocalScanError('LOCAL_UNAVAILABLE', "Bill reading isn't available in this preview. Enter the bill manually instead.");
  }
  onProgress = progress ?? null;
  try {
    progress?.({ step: 'Checking photo quality' });
    const img = await loadImage(photoUri);
    const quality = checkQuality(img);
    if (!quality.acceptable && quality.issues.includes('LOW_RESOLUTION')) {
      throw new LocalScanError('LOW_RESOLUTION', 'The image is too small to read. Please take a closer, sharper photo of the bill.');
    }
    let worker: Worker;
    try {
      worker = await getWorker();
    } catch {
      throw new LocalScanError('LOCAL_DOWNLOAD_FAILED', "Couldn't download the bill reader. Check your internet connection and try again.");
    }

    const { canvas, scale, g } = prepared(img);
    const sw = canvas.width;
    const sh = canvas.height;
    const attempt = async (c: HTMLCanvasElement, rotation: number, label: string) => {
      progress?.({ step: label });
      const { data } = await worker.recognize(c, {}, { blocks: true, text: false }); // word boxes + confidences
      const words = wordsOf(data);
      const result = validateReceipt(parseReceipt(assembleLines(words, textSlope(data))), quality, 'tesseract-browser', c.height);
      return { result, words, rotation, s: score(result, words) };
    };

    let best = await attempt(canvas, 0, 'Reading text');
    if (!goodEnough(best.result)) {
      const bw = await attempt(binarized(canvas, g), 0, 'Hard to read, trying again with sharper contrast');
      if (bw.s > best.s) best = bw;
    }
    if (best.words.length < 12) {
      // Almost nothing readable: the photo may be sideways.
      for (const rot of [90, 270] as const) {
        const r = await attempt(rotated(canvas, rot), rot, 'Checking if the photo is sideways');
        if (r.s > best.s) best = r;
        if (goodEnough(best.result)) break;
      }
    }

    // Boxes back onto the original photo, so the review screen can outline values on it.
    const map = (b: BoundingBox | null | undefined) => (b ? toInput(b, best.rotation, sw, sh, scale) : b);
    const r = best.result;
    const fix = <T extends { box?: BoundingBox | null }>(f: T): T => ({ ...f, box: map(f.box) });
    return {
      ...r,
      restaurantName: fix(r.restaurantName), billNumber: fix(r.billNumber), billDate: fix(r.billDate),
      subtotal: fix(r.subtotal), total: fix(r.total),
      items: r.items.map((i) => ({ ...i, name: fix(i.name), quantity: fix(i.quantity), unitPrice: fix(i.unitPrice), amount: fix(i.amount), discount: i.discount ? fix(i.discount) : i.discount })),
      charges: r.charges.map((c) => ({ ...c, amount: fix(c.amount) })),
    };
  } finally {
    onProgress = null;
  }
}
