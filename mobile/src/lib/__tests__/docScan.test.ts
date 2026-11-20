import { applyH, detectBill, homography, otsu, Quad, quadShift, toGray, warpQuad, warpSize } from '../docScan';

/** A dark frame with a light, slightly rotated rectangle ("the bill"). */
function frame(w: number, h: number, quad: Quad, light = 235, dark = 60): Uint8Array {
  const g = new Uint8Array(w * h).fill(dark);
  const inside = (x: number, y: number) => {
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
    }
    return true;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) g[y * w + x] = light;
  return g;
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

test('otsu splits a two-tone frame between the tones', () => {
  const g = new Uint8Array(1000);
  g.fill(50, 0, 600);
  g.fill(220, 600);
  const t = otsu(g);
  expect(t).toBeGreaterThanOrEqual(50);
  expect(t).toBeLessThan(220);
});

test('finds the four corners of a tilted bill', () => {
  const q: Quad = [{ x: 50, y: 40 }, { x: 140, y: 48 }, { x: 128, y: 250 }, { x: 38, y: 242 }];
  const d = detectBill(frame(180, 300, q), 180, 300)!;
  expect(d).not.toBeNull();
  expect(d.partial).toBe(false);
  d.quad.forEach((p, i) => expect(near(p, q[i], 3)).toBe(true));
});

test('reports a bill that runs off the frame as partial', () => {
  const q: Quad = [{ x: 30, y: -40 }, { x: 150, y: -40 }, { x: 150, y: 250 }, { x: 30, y: 250 }];
  const d = detectBill(frame(180, 300, q), 180, 300)!;
  expect(d.partial).toBe(true);
});

test('ignores frames with no bill (flat, or low contrast)', () => {
  expect(detectBill(new Uint8Array(180 * 300).fill(120), 180, 300)).toBeNull();
  const q: Quad = [{ x: 50, y: 40 }, { x: 140, y: 40 }, { x: 140, y: 250 }, { x: 50, y: 250 }];
  expect(detectBill(frame(180, 300, q, 130, 110), 180, 300)).toBeNull();
});

test('ignores blobs that are not rectangular', () => {
  // A light triangle covers only half the quad its extreme points span.
  const w = 180, h = 300;
  const g = new Uint8Array(w * h).fill(50);
  for (let y = 40; y < 260; y++) for (let x = 40; x < 40 + (y - 40) * 0.6; x++) g[y * w + x] = 230;
  expect(detectBill(g, w, h)).toBeNull();
});

test('homography maps corners onto corners', () => {
  const from: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
  const to: Quad = [{ x: 12, y: 8 }, { x: 105, y: 15 }, { x: 98, y: 210 }, { x: 4, y: 199 }];
  const H = homography(from, to);
  from.forEach((p, i) => expect(near(applyH(H, p.x, p.y), to[i], 1e-6)).toBe(true));
});

test('warp straightens a tilted bill into a flat, cropped rectangle', () => {
  const w = 200, h = 300;
  const q: Quad = [{ x: 40, y: 30 }, { x: 160, y: 40 }, { x: 150, y: 270 }, { x: 30, y: 262 }];
  const grey = frame(w, h, q);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < grey.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = grey[i]; rgba[i * 4 + 3] = 255; }
  const size = warpSize(q);
  expect(size.width).toBeGreaterThan(115);
  expect(size.height).toBeGreaterThan(225);
  const out = toGray(warpQuad(rgba, w, h, q, size.width, size.height), size.width, size.height);
  // Inside the output (away from the anti-aliased border) everything is paper.
  let dark = 0;
  for (let y = 4; y < size.height - 4; y++) for (let x = 4; x < size.width - 4; x++) if (out[y * size.width + x] < 150) dark++;
  expect(dark).toBe(0);
});

test('quadShift measures how much the bill moved', () => {
  const a: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const b: Quad = [{ x: 3, y: 4 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  expect(quadShift(a, b, 100, 200)).toBeCloseTo(0.05);
});
