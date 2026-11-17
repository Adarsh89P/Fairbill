/** Number recognition tuned for Indian receipts ("1,250.00", "500/-", "Rs.99", "(-)0.40"). Port of Tokens.java. */

const MONEY = /^-?\d{1,7}(\.\d{1,2})?$/;
const INT = /^\d{1,2}(\.0{1,3})?$/;
export const PERCENT = /^@?\(?\d{1,2}(\.\d{1,2})?\s*%\)?$/;

/** Clean a token that may be money; returns null when it is not unambiguously a number. */
export function cleanNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  // Stray marks OCR puts around digits ("?100.00", "|45.00", "300.00:"). The value keeps its OCR
  // confidence, so a low-confidence read still has to be verified by the user.
  let t = raw.trim().replace(/^[?|'"`!:;,*]+|[?|'"`!:;,*]+$/g, '');
  if (!t || t.includes('%')) return null;
  const negative = t.startsWith('-') || t.startsWith('(-)') || (t.endsWith('-') && !t.endsWith('/-')) || (t.startsWith('(') && t.endsWith(')'));
  t = t
    .replace(/^(rs\.?|inr)/i, '')
    .replace(/[₹$€£¥]/g, '')
    .replace(/\/-$/, '')
    .split('(-)').join('')
    .replace(/[()\-]/g, '')
    .split(',').join('');
  if (t.startsWith('.')) t = '0' + t;
  // Common OCR confusions, only inside tokens that are otherwise numeric.
  if (/^[0-9OoIl.]+$/.test(t) && /\d/.test(t)) {
    t = t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  }
  if (!MONEY.test(t)) return null;
  return negative ? '-' + t : t;
}

export function intValue(cleaned: string): number {
  return Math.trunc(Number(cleaned));
}

export function isSmallInt(cleaned: string | null): boolean {
  return cleaned != null && INT.test(cleaned) && intValue(cleaned) > 0;
}

/** Exact decimal string (up to 2 places) to integer paise. */
export function cents(cleaned: string): number {
  const neg = cleaned.startsWith('-');
  const [i, f = ''] = cleaned.replace('-', '').split('.');
  const v = Number(i) * 100 + Number((f + '00').slice(0, 2));
  return neg ? -v : v;
}

/** Integer paise to "123.45". */
export function format(c: number): string {
  const neg = c < 0;
  const a = Math.abs(c);
  return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
}

/** Normalises a money token to "123.45". */
export function money(cleaned: string): string {
  return format(cents(cleaned));
}

export function hasLetters(s: string, min: number): boolean {
  let n = 0;
  for (const ch of s) if (/\p{L}/u.test(ch)) n++;
  return n >= min;
}
