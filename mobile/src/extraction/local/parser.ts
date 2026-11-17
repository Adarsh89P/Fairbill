/**
 * Turns OCR lines into a structured receipt. Port of ReceiptParser.java: the parser only reports what it
 * can actually read. Anything ambiguous is marked "verify", anything unreadable "missing" with a reason.
 * It never invents values.
 */
import type { ExtractedCharge, ExtractedChargeKind, ExtractedField, ExtractedItem } from '../types';
import {
  boxOf, confidenceOf, field, isMissing, lineBox, lineConfidence, lineText, missingField, needsVerification, OcrLine,
} from './model';
import type { BoundingBox } from '../types';
import { cents, cleanNumber, format, hasLetters, intValue, isSmallInt, money, PERCENT } from './tokens';

const p = (re: string) => new RegExp(re, 'i');

// ---- keyword patterns (case-insensitive) ----
const ROUND_OFF = p('\\b(round(ed)?\\s*-?\\s*off|rounding|r\\s*/\\s*o)\\b');
const CGST = p('\\bc\\.?\\s?gst\\b');
const SGST = p('\\b(s|u)\\.?\\s?gst\\b');
const IGST = p('\\bi\\.?\\s?gst\\b');
const GST = p('\\b(gst|vat|tax)\\b');
const SERVICE = p('\\b(service\\s*(charge|chg|chrg|tax)?|s\\.?\\s?c\\.?)\\b');
const PACKAGING = p('\\b(packag(ing|e)|packing\\s*(charge|chg|chrg)?|(parcel|container|takeaway)\\s*(charge|chg|chrg)s?)\\b');
const DISCOUNT = p('\\b(discount|disc\\.?|coupon|promo|less\\s*:)');
const TIP = p('\\b(tip|gratuity)\\b');
const OTHER_CHARGE = p('\\b(delivery|convenience|platform|cover)\\s*(charge|fee|chg)?\\b|\\bcess\\b');

const SUBTOTAL = p('\\b(sub[\\s\\-]?total|item\\s*total|food\\s*total|gross\\s*(amount|total)|total\\s*before\\s*tax|bill\\s*total\\s*before)\\b');
const STRONG_TOTAL = p('\\b(grand\\s*total|net\\s*(amount|payable|total|amt)|amount\\s*payable|total\\s*payable|payable\\s*amount|bill\\s*amount|total\\s*amount\\s*payable|total\\s*due|amount\\s*due)\\b');
const PLAIN_TOTAL = p('\\btotal\\b|\\btotal\\s*(amount|amt|rs)\\b');
const NOT_MONEY_TOTAL = p('\\btotal\\s*(qty|quantity|items?|no\\.?\\s*of\\s*items|pax)\\b|\\b(no\\.?\\s*of\\s*items|item\\s*count)\\b');
const GST_ID = p('\\b(gstin|gst\\s*(no|number|reg|regn|#|in)\\b|tax\\s*invoice)');
const TAXABLE = p('\\b(taxable\\s*(amount|value|amt)|tax\\s*summary)\\b');

const HEADER = p('\\b(item|items|particulars|description|dish|food)\\b.*\\b(qty|quantity|amount|amt|rate|price|total)\\b');
const SERIAL_HEADER = p('\\b(s\\.?\\s?no|sr\\.?\\s?no|sl\\.?\\s?no|#)\\b');
const PAYMENT = p('\\b(cash|card|upi|paytm|gpay|phonepe|tendered|change|balance|paid|visa|master|tender)\\b');
const META = p('\\b(gstin|gst\\s*no|fssai|cin|pan|ph(one)?|mob(ile)?|tel|email|www\\.|\\.com|address|table|tbl|cover|pax|waiter|steward|captain|cashier|server|kot|time|date|bill\\s*no|invoice|order|token|thank|visit|again|welcome|customer|guest|counter|dine|outlet|hsn|sac)\\b');
const TITLE_NOISE = p('^(tax\\s*invoice|invoice|bill|retail\\s*invoice|estimate|duplicate|original|cash\\s*memo|kot)$');

const BILL_NO = /\b(bill|invoice|inv|receipt|order|check|chk)\s*(no|num|number|#|id)?\.?\s*[:#\-]?\s*([A-Z0-9][A-Z0-9/\-]{1,24})/gi;
const DATE_NUMERIC = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;
const DATE_ISO = /\b(20\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/;
const DATE_WORD = /\b(\d{1,2})[\s\-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-,']*(\d{2,4})\b/i;
const LEADING_QTY = /^(\d{1,2})\s*(x|\*|no\.?|nos\.?|pcs?)?\s+(?=[a-z])/i;
const TRAILING_QTY = /\s+(x|\*)\s*(\d{1,2})$/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface ParsedReceipt {
  restaurantName: ExtractedField<string> | null;
  billNumber: ExtractedField<string> | null;
  billDate: ExtractedField<string> | null;
  subtotal: ExtractedField<string> | null;
  total: ExtractedField<string> | null;
  items: ExtractedItem[];
  charges: ExtractedCharge[];
  unclassifiedSummaryLines: string[];
  unreadableItemLines: number;
  lineCount: number;
  lastLineBottom: number;
  itemsEndIdx: number;
}

interface Num {
  value: string;
  raw: string;
  conf: number;
  box: BoundingBox;
}

export function parseReceipt(allLines: OcrLine[]): ParsedReceipt {
  const lines = allLines.filter((l) => lineText(l).trim() !== '');
  const last = lines.length ? lineBox(lines[lines.length - 1]) : null;
  const r: ParsedReceipt = {
    restaurantName: findRestaurant(lines),
    billNumber: findBillNumber(lines),
    billDate: findDate(lines),
    subtotal: null,
    total: null,
    items: [],
    charges: [],
    unclassifiedSummaryLines: [],
    unreadableItemLines: 0,
    lineCount: lines.length,
    lastLineBottom: last ? last.y + last.height : 0,
    itemsEndIdx: -1,
  };

  let serialColumn = false;
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lineText(lines[i]);
    if (HEADER.test(t) && trailingNumbers(lines[i]).length === 0) {
      headerIdx = i;
      serialColumn = SERIAL_HEADER.test(t);
      break;
    }
  }

  let inSummary = false;
  let pendingName: string | null = null;
  let pendingLine: OcrLine | null = null;
  const plainTotals: ExtractedField<string>[] = [];
  let itemsEndIdx = -1;
  let chargesAfterPlainTotal = false;

  const flush = () => {
    if (pendingName != null && pendingLine) flushPendingAsMissing(r, pendingName, pendingLine);
    pendingName = null;
    pendingLine = null;
  };

  for (let i = Math.max(0, headerIdx + 1); i < lines.length; i++) {
    const line = lines[i];
    const text = lineText(line);
    const lower = text.toLowerCase();
    const nums = trailingNumbers(line);

    if (GST_ID.test(lower)) continue;
    if (NOT_MONEY_TOTAL.test(lower) || TAXABLE.test(lower)) {
      inSummary = inSummary || (NOT_MONEY_TOTAL.test(lower) && r.items.length > 0);
      continue;
    }
    const kind = chargeKind(lower);
    const isSubtotal = SUBTOTAL.test(lower);
    const isStrongTotal = STRONG_TOTAL.test(lower);
    const isPlainTotal = !isSubtotal && !isStrongTotal && kind == null && PLAIN_TOTAL.test(lower);

    const summaryLine = isSubtotal || isStrongTotal || isPlainTotal || kind != null;
    // Titles like "TAX INVOICE" or "Total" headings above the items carry no amount: skip them.
    if (summaryLine && r.items.length === 0 && pendingName == null && nums.length === 0) continue;
    if (summaryLine) {
      flush();
      if (!inSummary) itemsEndIdx = i;
      inSummary = true;
      const amount = amountField(line, nums, labelOf(text));
      if (isSubtotal) {
        if (r.subtotal == null || isMissing(r.subtotal)) r.subtotal = amount;
      } else if (isStrongTotal) {
        r.total = amount; // last strong total wins (e.g. "Net Amount" after "Grand Total")
      } else if (isPlainTotal) {
        plainTotals.push(amount);
      } else {
        r.charges.push({ kind: kind!, label: cleanLabel(text, kind!), amount, rate: percentOf(text) });
        chargesAfterPlainTotal = chargesAfterPlainTotal || plainTotals.length > 0;
      }
      continue;
    }
    if (inSummary) {
      if (!PAYMENT.test(lower) && !META.test(lower) && nums.length && hasLetters(text, 3)) r.unclassifiedSummaryLines.push(text);
      continue;
    }
    if (PAYMENT.test(lower) && r.items.length === 0) continue;
    if (META.test(lower) && (nums.length === 0 || (headerIdx < 0 && r.items.length === 0))) continue;
    if (headerIdx < 0 && r.items.length === 0 && (nums.length === 0 || !nums[nums.length - 1].value.includes('.'))) {
      continue; // no table header: items start at the first line ending in a decimal amount
    }

    // ---- item lines ----
    let namePart = stripNumbers(text, nums);
    if (nums.length === 0) {
      if (hasLetters(text, 3)) {
        flush();
        pendingName = text.trim();
        pendingLine = line;
      } else {
        r.unreadableItemLines++;
      }
      continue;
    }
    let merged = false;
    if (pendingName != null) {
      // Long names wrap onto the next line ("Chicken Tikka Butter" / "Masala 1 300.00").
      // Only merge when this line's own name is too short to be a dish by itself;
      // otherwise the previous line is an item whose price could not be read.
      const own = namePart.replace(/^\s*\d{1,3}[.)]?\s+/, '').trim();
      const continuation = !own || (own.split(/\s+/).length === 1 && own.replace(/[^A-Za-z]/g, '').length < 8);
      if (continuation) {
        namePart = (pendingName + ' ' + namePart).trim();
        merged = true;
        pendingName = null;
        pendingLine = null;
      } else {
        flush();
      }
    }
    r.items.push(parseItem(line, namePart, nums, serialColumn, merged));
  }
  flush();
  r.itemsEndIdx = itemsEndIdx;

  // A plain "Total" followed by taxes is really the subtotal; the last plain total is the final amount.
  if (plainTotals.length) {
    if (chargesAfterPlainTotal && (r.subtotal == null || isMissing(r.subtotal))) {
      r.subtotal = plainTotals[0];
      if (plainTotals.length > 1 && r.total == null) r.total = plainTotals[plainTotals.length - 1];
    } else if (r.total == null) {
      r.total = plainTotals[plainTotals.length - 1];
    }
  }
  return r;
}

// ---------------------------------------------------------------- items

function parseItem(line: OcrLine, rawName: string, nums: Num[], serialColumn: boolean, mergedName: boolean): ExtractedItem {
  let name = rawName;
  let qty: ExtractedField<number> | null = null;
  let rate: ExtractedField<string> = missingField('Rate not printed');

  if (serialColumn) name = name.replace(/^\s*\d{1,3}[.)]?\s+/, '');

  const amt = nums[nums.length - 1];
  let amount = field(money(amt.value), amt.conf, amt.raw, amt.box);

  if (nums.length >= 3) {
    const a = nums[nums.length - 3];
    const b = nums[nums.length - 2];
    const q = isSmallInt(a.value) ? a : isSmallInt(b.value) ? b : null;
    const rt = q === a ? b : a;
    if (q) {
      qty = field(intValue(q.value), q.conf, q.raw, q.box);
      rate = field(money(rt.value), rt.conf, rt.raw, rt.box);
    }
  } else if (nums.length === 2) {
    const a = nums[0];
    const sameAsAmount = cents(a.value) === cents(amt.value);
    if (isSmallInt(a.value) && !sameAsAmount) {
      qty = field(intValue(a.value), a.conf, a.raw, a.box);
      if ((qty.value ?? 0) > 20) qty = needsVerification(qty, 'Unusually large quantity');
    } else {
      rate = field(money(a.value), a.conf, a.raw, a.box);
    }
  }
  if (!qty) {
    const lead = LEADING_QTY.exec(name);
    const trail = TRAILING_QTY.exec(name);
    if (!serialColumn && lead) {
      qty = field(Number(lead[1]), confidenceOf(line, lead[1]), lead[1], boxOf(line, lead[1]));
      name = name.slice(lead[0].length);
    } else if (trail) {
      qty = field(Number(trail[2]), confidenceOf(line, trail[2]), trail[2], boxOf(line, trail[2]));
      name = name.slice(0, trail.index);
    }
  }
  if (!qty) qty = missingField('Quantity not detected');

  // Arithmetic check: qty × rate must equal amount when all three are printed.
  if (!isMissing(qty) && !isMissing(rate)) {
    const expected = cents(rate.value!) * qty.value!;
    if (expected !== cents(amount.value!)) {
      amount = needsVerification(amount, `Quantity × rate (${format(expected)}) does not match the amount`);
    }
  }

  name = name.replace(/[|_*~]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s.:\-]+|[\s.:\-]+$/g, '');
  let nameField: ExtractedField<string>;
  if (!hasLetters(name, 2)) {
    nameField = missingField('Item name could not be identified', lineText(line), lineBox(line));
  } else {
    const lettered = line.words.filter((w) => hasLetters(w.text, 1));
    const conf = lettered.length ? lettered.reduce((a, w) => a + w.confidence, 0) / lettered.length : 0;
    nameField = field(name, conf, name, lineBox(line));
    if (mergedName) nameField = needsVerification(nameField, 'Name read across two lines');
  }
  return { name: nameField, quantity: qty, unitPrice: rate, amount, discount: null, lineText: lineText(line) };
}

function flushPendingAsMissing(r: ParsedReceipt, name: string, line: OcrLine) {
  r.items.push({
    name: needsVerification(field(name, lineConfidence(line), name, lineBox(line)), 'Price could not be read for this item'),
    quantity: missingField('Quantity not detected'),
    unitPrice: missingField('Rate not detected'),
    amount: missingField('The price of this item is unclear', lineText(line), lineBox(line)),
    discount: null,
    lineText: lineText(line),
  });
}

// ---------------------------------------------------------------- numbers

/** Numeric tokens at the end of the line (right-hand columns), left to right. */
export function trailingNumbers(line: OcrLine): Num[] {
  const out: Num[] = [];
  const words = line.words;
  for (let i = words.length - 1; i >= 0; i--) {
    const raw = words[i].text;
    if (PERCENT.test(raw)) break;
    if (/^(rs\.?|inr|₹|\/-|:|-)$/i.test(raw)) continue;
    const clean = cleanNumber(raw);
    if (clean == null) break;
    out.unshift({ value: clean, raw, conf: words[i].confidence, box: words[i].box });
    if (out.length === 3) break;
  }
  return out;
}

function stripNumbers(text: string, nums: Num[]): string {
  let s = text;
  for (let i = nums.length - 1; i >= 0; i--) {
    const idx = s.lastIndexOf(nums[i].raw);
    if (idx >= 0) s = s.slice(0, idx);
  }
  return s.replace(/\s*(rs\.?|₹|inr)\s*$/i, '').trim();
}

function amountField(line: OcrLine, nums: Num[], label: string): ExtractedField<string> {
  if (!nums.length) return missingField(`Amount for "${label}" could not be read`, lineText(line), lineBox(line));
  const n = nums[nums.length - 1];
  return field(money(n.value), n.conf, n.raw, n.box);
}

function percentOf(text: string): string | null {
  const m = /(\d{1,2}(\.\d{1,2})?)\s*%/.exec(text);
  return m ? m[1] + '%' : null;
}

// ---------------------------------------------------------------- classification

export function chargeKind(lower: string): ExtractedChargeKind | null {
  if (ROUND_OFF.test(lower)) return 'ROUND_OFF';
  if (CGST.test(lower)) return 'CGST';
  if (SGST.test(lower)) return 'SGST';
  if (IGST.test(lower)) return 'IGST';
  if (SERVICE.test(lower) && !lower.includes('gst')) return 'SERVICE';
  if (PACKAGING.test(lower)) return 'PACKAGING';
  if (DISCOUNT.test(lower)) return 'DISCOUNT';
  if (TIP.test(lower)) return 'TIP';
  if (OTHER_CHARGE.test(lower)) return 'OTHER';
  if (GST.test(lower) && !lower.includes('gstin') && !lower.includes('incl')) return 'GST';
  return null;
}

function labelOf(text: string): string {
  return text.replace(/[\d.,₹:/\-%@()~|_*="'`]+/g, ' ').replace(/\brs\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function cleanLabel(text: string, kind: ExtractedChargeKind): string {
  const l = labelOf(text);
  return !l ? kind : l.length > 40 ? l.slice(0, 40) : l;
}

// ---------------------------------------------------------------- header fields

function findRestaurant(lines: OcrLine[]): ExtractedField<string> {
  const limit = Math.min(lines.length, 6);
  for (let i = 0; i < limit; i++) {
    const l = lines[i];
    const t = lineText(l).replace(/[*=_~|]+/g, ' ').trim();
    const lower = t.toLowerCase();
    if (!hasLetters(t, 3) || TITLE_NOISE.test(lower) || META.test(lower)) continue;
    const digits = (t.match(/\d/g) ?? []).length;
    if (digits > 3) continue; // addresses and phone numbers
    return field(t, Math.min(lineConfidence(l), 0.95), lineText(l), lineBox(l));
  }
  return missingField('Restaurant name not detected');
}

function findBillNumber(lines: OcrLine[]): ExtractedField<string> {
  for (const l of lines) {
    const t = lineText(l);
    BILL_NO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BILL_NO.exec(t))) {
      const v = m[3];
      if (/\d/.test(v) && !DATE_NUMERIC.test(v)) return field(v, confidenceOf(l, v), t, boxOf(l, v));
    }
  }
  return missingField('Bill number not detected');
}

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(lines: OcrLine[]): ExtractedField<string> {
  for (const l of lines) {
    const t = lineText(l);
    const iso = DATE_ISO.exec(t);
    if (iso) {
      const d = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (d) return field(d, confidenceOf(l, iso[0]), iso[0], boxOf(l, iso[0]));
      continue; // invalid calendar date: keep looking
    }
    const num = DATE_NUMERIC.exec(t);
    if (num) {
      const a = Number(num[1]);
      const b = Number(num[2]);
      let y = Number(num[3]);
      if (y < 100) y += 2000;
      // Indian bills print DD/MM/YYYY.
      const d = isoDate(y, b, a);
      if (d) {
        let f = field(d, confidenceOf(l, num[0]), num[0], boxOf(l, num[0]));
        if (a <= 12 && b <= 12 && a !== b) f = needsVerification(f, 'Date read as DD/MM/YYYY');
        return f;
      }
      continue;
    }
    const w = DATE_WORD.exec(t);
    if (w) {
      let y = Number(w[3]);
      if (y < 100) y += 2000;
      const d = isoDate(y, MONTHS.indexOf(w[2].slice(0, 3).toLowerCase()) + 1, Number(w[1]));
      if (d) return field(d, confidenceOf(l, w[0]), w[0], boxOf(l, w[0]));
    }
  }
  return missingField('Bill date not detected');
}
