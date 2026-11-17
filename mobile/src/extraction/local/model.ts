/**
 * Building blocks for reading a bill on the device (web). This is a TypeScript port of the server's
 * extraction engine (backend/src/main/java/com/fairbill/extraction) and produces the same
 * ExtractionResult JSON, so the rest of the app can't tell where a bill was read.
 */
import type { BoundingBox, ExtractedField } from '../types';

export const VERIFIED_THRESHOLD = 0.85;

export interface OcrWord {
  text: string;
  /** 0..1 */
  confidence: number;
  box: BoundingBox;
}

export interface OcrLine {
  words: OcrWord[];
}

export function lineText(l: OcrLine): string {
  return l.words.map((w) => w.text).join(' ').trim();
}

export function lineConfidence(l: OcrLine): number {
  return l.words.length ? l.words.reduce((a, w) => a + w.confidence, 0) / l.words.length : 0;
}

export function union(a: BoundingBox | null, b: BoundingBox | null): BoundingBox | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

export function lineBox(l: OcrLine): BoundingBox | null {
  return l.words.reduce<BoundingBox | null>((b, w) => union(b, w.box), null);
}

const squash = (s: string) => s.replace(/\s+/g, '');

/** Lowest confidence among the words whose text contains the fragment (or is contained in it). */
export function confidenceOf(l: OcrLine, fragment: string): number {
  const target = squash(fragment);
  let min = 1;
  let found = false;
  for (const w of l.words) {
    const t = squash(w.text);
    if (t && (target.includes(t) || t.includes(target))) {
      min = Math.min(min, w.confidence);
      found = true;
    }
  }
  return found ? min : lineConfidence(l);
}

export function boxOf(l: OcrLine, fragment: string): BoundingBox | null {
  const target = squash(fragment);
  let b: BoundingBox | null = null;
  for (const w of l.words) {
    const t = squash(w.text);
    if (t && (target.includes(t) || t.includes(target))) b = union(b, w.box);
  }
  return b ?? lineBox(l);
}

const round3 = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 1000) / 1000;

export function field<T>(value: T, confidence: number, text: string | null, box: BoundingBox | null): ExtractedField<T> {
  const ok = confidence >= VERIFIED_THRESHOLD;
  return {
    value,
    confidence: round3(confidence),
    status: ok ? 'ok' : 'verify',
    text,
    box,
    note: ok ? null : `Low OCR confidence (${Math.round(confidence * 100)}%)`,
  };
}

export function missingField<T>(note: string, text: string | null = null, box: BoundingBox | null = null): ExtractedField<T> {
  return { value: null, confidence: 0, status: 'missing', text, box, note };
}

export function needsVerification<T>(f: ExtractedField<T>, reason: string): ExtractedField<T> {
  return f.status === 'missing' ? f : { ...f, status: 'verify', note: reason };
}

export function isMissing(f: ExtractedField<unknown> | null | undefined): boolean {
  return !f || f.status === 'missing' || f.value === null;
}
