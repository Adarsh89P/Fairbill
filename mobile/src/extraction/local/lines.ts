import type { OcrLine, OcrWord } from './model';

/**
 * Groups words into visual rows by vertical position, so an item name on the left and its price in a
 * far-right column end up on the same line even when the OCR engine reports them as separate blocks.
 * Port of LineAssembler.java, plus tilt correction: `slope` is the text's dy/dx (from the OCR baselines).
 */
export function assembleLines(words: OcrWord[], slope = 0): OcrLine[] {
  const sorted = words.filter((w) => w.box && w.text.trim()).slice();
  if (!sorted.length) return [];
  // On a tilted photo a row drifts up or down across the page; measure rows along the tilt (slope = dy/dx).
  const cy = (w: OcrWord) => w.box.y + w.box.height / 2 - (w.box.x + w.box.width / 2) * slope;
  sorted.sort((a, b) => cy(a) - cy(b));
  const heights = sorted.map((w) => w.box.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(sorted.length / 2)] ?? 10;

  const rows: OcrWord[][] = [];
  const centers: number[] = [];
  for (const w of sorted) {
    const c = cy(w);
    let match = -1;
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - 3); i--) {
      if (Math.abs(centers[i] - c) <= medianH * 0.55) {
        match = i;
        break;
      }
    }
    if (match < 0) {
      rows.push([w]);
      centers.push(c);
    } else {
      const row = rows[match];
      row.push(w);
      centers[match] = (centers[match] * (row.length - 1) + c) / row.length;
    }
  }
  return rows.map((row) => ({ words: row.slice().sort((a, b) => a.box.x - b.box.x) }));
}
