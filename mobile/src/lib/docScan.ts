/**
 * Document-scanner maths for the live bill scanner (pure functions, no DOM, unit-tested).
 *
 *  - detectBill: finds the bill in a small greyscale frame. A bill is light paper on a darker table, so the
 *    frame is split into light/dark with Otsu's threshold, the largest light region is taken, and its four
 *    corners are the extreme points along the two diagonals. The region must be big enough, look like a
 *    rectangle and (for "whole bill") not touch the frame edge.
 *  - warpQuad: straightens and crops the photo to the bill (perspective transform, bilinear sampling).
 */

export interface Pt {
  x: number;
  y: number;
}
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

export interface Detection {
  quad: Quad;
  /** Part of the bill is outside the frame (a corner sits on the edge). */
  partial: boolean;
  /** Bill area as a share of the frame, 0..1. */
  coverage: number;
}

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return g;
}

/** Otsu's threshold: the grey level that best separates the frame into two groups. */
export function otsu(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function convex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Every corner between 45° and 135°: a bill seen at an angle, not a triangle or a sliver. */
function squareish(q: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4];
    const c = q[i];
    const n = q[(i + 1) % 4];
    const ax = p.x - c.x, ay = p.y - c.y, bx = n.x - c.x, by = n.y - c.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 4 || lb < 4) return false;
    const cos = (ax * bx + ay * by) / (la * lb);
    if (Math.abs(cos) > Math.cos(Math.PI / 4)) return false;
  }
  return true;
}

/**
 * Finds the bill in a greyscale frame (best at ~160–240 px wide). Returns null when no bill-like
 * light rectangle is visible.
 */
export function detectBill(gray: Uint8Array, w: number, h: number): Detection | null {
  const thr = otsu(gray);
  // Need real contrast between paper and background.
  let lightSum = 0, lightN = 0, darkSum = 0, darkN = 0;
  for (const v of gray) {
    if (v > thr) { lightSum += v; lightN++; } else { darkSum += v; darkN++; }
  }
  if (!lightN || !darkN || lightSum / lightN - darkSum / darkN < 40) return null;

  // Largest 4-connected light region.
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let label = 0;
  for (let start = 0; start < gray.length; start++) {
    if (labels[start] || gray[start] <= thr) continue;
    label++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;
    let size = 0;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0 && !labels[i - 1] && gray[i - 1] > thr) { labels[i - 1] = label; stack[sp++] = i - 1; }
      if (x < w - 1 && !labels[i + 1] && gray[i + 1] > thr) { labels[i + 1] = label; stack[sp++] = i + 1; }
      if (y > 0 && !labels[i - w] && gray[i - w] > thr) { labels[i - w] = label; stack[sp++] = i - w; }
      if (y < h - 1 && !labels[i + w] && gray[i + w] > thr) { labels[i + w] = label; stack[sp++] = i + w; }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
  }
  const coverage = bestSize / (w * h);
  if (coverage < 0.08 || coverage > 0.93) return null;

  // Corners: extreme points along the diagonals.
  let tl = { x: 0, y: 0, s: Infinity }, br = { x: 0, y: 0, s: -Infinity }, tr = { x: 0, y: 0, s: -Infinity }, bl = { x: 0, y: 0, s: Infinity };
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== bestLabel) continue;
    const x = i % w;
    const y = (i - x) / w;
    const sum = x + y;
    const diff = x - y;
    if (sum < tl.s) tl = { x, y, s: sum };
    if (sum > br.s) br = { x, y, s: sum };
    if (diff > tr.s) tr = { x, y, s: diff };
    if (diff < bl.s) bl = { x, y, s: diff };
  }
  const quad: Quad = [{ x: tl.x, y: tl.y }, { x: tr.x + 1, y: tr.y }, { x: br.x + 1, y: br.y + 1 }, { x: bl.x, y: bl.y + 1 }];
  if (!convex(quad) || !squareish(quad)) return null;
  const area = quadArea(quad);
  // A bill fills the quad it spans; a blob (hand, glare, plate) does not.
  const fill = bestSize / area;
  if (fill < 0.8 || fill > 1.2) return null;
  const edge = 2;
  const partial = quad.some((p) => p.x <= edge || p.y <= edge || p.x >= w - edge || p.y >= h - edge);
  return { quad, partial, coverage };
}

/** Largest corner movement between two quads, as a share of the frame's shorter side. */
export function quadShift(a: Quad, b: Quad, w: number, h: number): number {
  let m = 0;
  for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return m / Math.min(w, h);
}

/** Output size for a straightened bill: the longer of each pair of opposite edges, capped at maxSide. */
export function warpSize(q: Quad, maxSide = 2000): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let width = Math.max(d(q[0], q[1]), d(q[3], q[2]));
  let height = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * k));
  height = Math.max(1, Math.round(height * k));
  return { width, height };
}

/** Homography H (3x3, row-major, h33 = 1) mapping each `from` point to the matching `to` point. */
export function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const piv = A[c][c];
    if (Math.abs(piv) < 1e-12) throw new Error('Degenerate corners');
    for (let k = c; k < 9; k++) A[c][k] /= piv;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (!f) continue;
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row) => row[8]), 1];
}

export function applyH(H: number[], x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/**
 * Straightens the bill: maps the quad in the RGBA source onto a width×height rectangle (bilinear).
 * Returns RGBA pixels.
 */
export function warpQuad(src: Uint8ClampedArray, sw: number, sh: number, quad: Quad, width: number, height: number): Uint8ClampedArray {
  const H = homography([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], quad);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyH(H, x + 0.5, y + 0.5);
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1.001);
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1.001);
      const x0 = fx | 0;
      const y0 = fy | 0;
      const ax = fx - x0;
      const ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const o = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = src[i00 + ch] + (src[i10 + ch] - src[i00 + ch]) * ax;
        const bot = src[i01 + ch] + (src[i11 + ch] - src[i01 + ch]) * ax;
        out[o + ch] = top + (bot - top) * ay;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
