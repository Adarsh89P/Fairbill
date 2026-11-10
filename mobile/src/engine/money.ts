/**
 * Money helpers. All amounts inside FairBill are integers in the currency's
 * smallest unit (paise for INR). Floating point is only used for display.
 */
export type Minor = number;

export interface Currency {
  code: string;
  symbol: string;
  minorDigits: number;
  locale: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', minorDigits: 2, locale: 'en-IN' },
  { code: 'USD', symbol: '$', minorDigits: 2, locale: 'en-US' },
  { code: 'EUR', symbol: '€', minorDigits: 2, locale: 'de-DE' },
  { code: 'GBP', symbol: '£', minorDigits: 2, locale: 'en-GB' },
  { code: 'AED', symbol: 'AED ', minorDigits: 2, locale: 'en-AE' },
  { code: 'SGD', symbol: 'S$', minorDigits: 2, locale: 'en-SG' },
  { code: 'JPY', symbol: '¥', minorDigits: 0, locale: 'ja-JP' },
];

export const INR = CURRENCIES[0];

export function currencyFor(code: string | undefined): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? INR;
}

export function assertMinor(n: number, what = 'amount'): void {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${what} must be an integer number of minor units, got ${n}`);
  }
}

/**
 * Parse user/OCR text such as "1,234.50", "₹ 99", "-12.5" into minor units.
 * Returns null when the text is not a clean number (never guesses).
 */
export function parseMoney(text: string, currency: Currency = INR): Minor | null {
  const cleaned = text.replace(/[₹$€£¥,\s]|Rs\.?|INR|AED|S\$/gi, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [whole, frac = ''] = cleaned.replace('-', '').split('.');
  if (frac.length > currency.minorDigits) {
    // More decimals than the currency supports: reject rather than round silently.
    if (!/^0*$/.test(frac.slice(currency.minorDigits))) return null;
  }
  const fracPadded = (frac + '0'.repeat(currency.minorDigits)).slice(0, currency.minorDigits);
  const value = Number(whole) * 10 ** currency.minorDigits + (fracPadded ? Number(fracPadded) : 0);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/** Minor units -> plain decimal string without symbol, e.g. 123450 -> "1234.50". */
export function toDecimalString(amount: Minor, currency: Currency = INR): string {
  assertMinor(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  if (currency.minorDigits === 0) return `${negative ? '-' : ''}${abs}`;
  const base = 10 ** currency.minorDigits;
  const whole = Math.floor(abs / base);
  const frac = String(abs % base).padStart(currency.minorDigits, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

function groupDigits(whole: string, indian: boolean): string {
  if (!indian) return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Indian grouping: 12,34,567
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Format for display: 123450 -> "₹1,234.50"; drops ".00" when compact. */
export function formatMoney(amount: Minor, currency: Currency = INR, opts: { compact?: boolean } = {}): string {
  const s = toDecimalString(amount, currency);
  const negative = s.startsWith('-');
  const [whole, frac] = s.replace('-', '').split('.');
  const grouped = groupDigits(whole, currency.code === 'INR');
  const showFrac = frac !== undefined && !(opts.compact && /^0+$/.test(frac));
  return `${negative ? '−' : ''}${currency.symbol}${grouped}${showFrac ? '.' + frac : ''}`;
}

/**
 * Split `total` into integer parts proportional to `weights` using the
 * largest-remainder method. The parts always sum exactly to `total`.
 * Ties are broken by position, so results are deterministic.
 */
export function allocate(total: Minor, weights: number[]): Minor[] {
  assertMinor(total, 'total');
  if (weights.length === 0) throw new Error('allocate: no recipients');
  const w = weights.map((x) => {
    if (!Number.isSafeInteger(x) || x < 0) throw new Error(`allocate: weights must be non-negative integers, got ${x}`);
    return x;
  });
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error('allocate: weights sum to zero');
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  if (!Number.isSafeInteger(abs * sum)) throw new Error('allocate: amount too large');

  const parts = w.map((x) => Math.floor((abs * x) / sum));
  const remainders = w.map((x, i) => ({ i, r: (abs * x) % sum }));
  let left = abs - parts.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) parts[remainders[k % remainders.length].i] += 1;
  return parts.map((p) => (p === 0 ? 0 : sign * p));
}

export function sum(values: Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}
