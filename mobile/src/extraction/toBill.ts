import { currencyFor, Minor, parseMoney } from '../engine/money';
import { newBill, uid } from '../engine/factory';
import type { Bill, BillCharge, BillItem, Tracked } from '../engine/types';
import { CHARGE_LABELS } from '../engine/types';
import type { ExtractedField, ExtractionResult } from './types';

/** Anything below this is never treated as verified, whatever the server says. */
export const MIN_VERIFIED_CONFIDENCE = 0.85;

function track<T>(f: ExtractedField<T> | null | undefined, parse?: (v: T) => any): Tracked<any> {
  if (!f || f.value === null || f.value === undefined || f.status === 'missing') {
    return { value: null, status: 'missing', note: f?.note ?? undefined, confidence: f?.confidence };
  }
  const value = parse ? parse(f.value) : f.value;
  if (value === null || value === undefined) {
    return { value: null, status: 'missing', note: `Could not read "${f.text ?? f.value}"`, confidence: f.confidence };
  }
  const status = f.status === 'ok' && f.confidence >= MIN_VERIFIED_CONFIDENCE ? 'ok' : 'verify';
  return { value, status, confidence: f.confidence, note: f.note ?? undefined };
}

export function extractionToBill(x: ExtractionResult, origin: 'scan' | 'upload', currency = 'INR', imageUri?: string): Bill {
  const cur = currencyFor(currency);
  const money = (s: string): Minor | null => parseMoney(s, cur);
  const bill = newBill(origin, currency);
  bill.restaurant = track(x.restaurantName);
  bill.billNumber = track(x.billNumber);
  bill.date = track(x.billDate);
  bill.subtotal = track(x.subtotal, money);
  bill.total = track(x.total, money);
  bill.items = x.items.map<BillItem>((it) => {
    const discount = it.discount?.value ? money(it.discount.value) ?? 0 : 0;
    return {
      id: uid('item'),
      name: track(it.name),
      quantity: track(it.quantity),
      unitPrice: track(it.unitPrice, money),
      amount: track(it.amount, money),
      discount: Math.abs(discount),
      source: 'ocr',
    };
  });
  // Quantity is optional on many bills. It is never assumed; the item stays flagged for review.
  for (const it of bill.items) {
    if (it.quantity.value === null) it.quantity = { value: null, status: 'missing', note: 'Quantity not detected' };
  }
  bill.charges = x.charges.map<BillCharge>((c) => ({
    id: uid('chg'),
    kind: c.kind,
    label: c.label || CHARGE_LABELS[c.kind],
    amount: track(c.amount, (v: string) => {
      const m = money(v);
      if (m === null) return null;
      return c.kind === 'DISCOUNT' ? -Math.abs(m) : m;
    }),
    source: 'ocr',
  }));
  bill.warnings = x.warnings.map((w) => ({ code: w.code, message: w.message, field: w.field ?? undefined }));
  bill.receiptImageUri = imageUri;
  bill.receiptId = x.receiptId ?? undefined;
  return bill;
}
