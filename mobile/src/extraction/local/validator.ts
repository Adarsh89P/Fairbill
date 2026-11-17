/**
 * Confidence validation and missing-field detection. Port of ExtractionValidator.java: cross-checks the
 * numbers printed on the bill against each other and downgrades anything that doesn't add up to "verify".
 */
import type { ExtractedCharge, ExtractedChargeKind, ExtractedField, ExtractionResult, ExtractionWarningDto, ImageQuality } from '../types';
import { isMissing, missingField, needsVerification } from './model';
import type { ParsedReceipt } from './parser';
import { cents, format } from './tokens';

const warn = (code: string, message: string, fieldPath: string | null = null): ExtractionWarningDto => ({ code, message, field: fieldPath });
const isTax = (k: ExtractedChargeKind) => k === 'CGST' || k === 'SGST' || k === 'IGST' || k === 'GST';
const rupees = (c: number) => '₹' + format(c);

export function validateReceipt(p: ParsedReceipt, quality: ImageQuality, engine: string, imageHeight: number): ExtractionResult {
  const warnings: ExtractionWarningDto[] = [];
  const missing = new Set<string>();
  const uncertain = new Set<string>();
  const track = (f: ExtractedField<unknown> | null, path: string) => {
    if (!f || isMissing(f)) missing.add(path);
    else if (f.status === 'verify') uncertain.add(path);
  };

  for (const issue of quality.issues) {
    if (issue === 'BLURRY') warnings.push(warn('IMAGE_BLURRY', 'The uploaded image is blurry. Some values may be misread — retake the photo if possible.'));
    if (issue === 'TOO_DARK') warnings.push(warn('IMAGE_DARK', 'The photo is too dark. Try again with more light.'));
    if (issue === 'OVEREXPOSED') warnings.push(warn('IMAGE_GLARE', 'The photo is overexposed or has glare.'));
    if (issue === 'LOW_RESOLUTION') warnings.push(warn('IMAGE_SMALL', 'The image resolution is too low to read reliably.'));
  }
  if (p.lineCount === 0) warnings.push(warn('NO_TEXT', 'No text could be read from this image. Make sure the whole bill is in the photo.'));

  let subtotal = p.subtotal ?? missingField<string>('Subtotal not detected');
  let total = p.total ?? missingField<string>('The final bill amount could not be detected');
  const items = p.items.slice();
  let charges = dropSummaryGst(p.charges.slice(), warnings);

  // ---- items ----
  if (!items.length && p.lineCount > 0) {
    warnings.push(warn('NO_ITEMS', 'No food items could be identified. Add them manually.', 'items'));
    missing.add('items');
  }
  if (p.unreadableItemLines > 0 || items.some((i) => isMissing(i.name))) {
    warnings.push(warn('ITEMS_UNIDENTIFIED', 'Some items could not be identified.', 'items'));
  }
  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    const path = `items[${i}]`;
    track(it.name, path + '.name');
    track(it.quantity, path + '.quantity');
    track(it.amount, path + '.amount');
    if (isMissing(it.amount)) {
      const n = isMissing(it.name) ? 'an item' : `"${it.name.value}"`;
      warnings.push(warn('ITEM_PRICE_UNCLEAR', `The price of ${n} is unclear.`, path + '.amount'));
    }
    if (!isMissing(it.name) && !isMissing(it.amount)) {
      const key = it.name.value!.toLowerCase().replace(/\s+/g, ' ') + '|' + it.amount.value;
      if (seen.has(key)) {
        warnings.push(warn('POSSIBLE_DUPLICATE', `"${it.name.value}" appears more than once with the same price. Check it isn't a duplicate.`, path));
      } else seen.set(key, i);
    }
  });

  // ---- charges ----
  let taxUnreadable = false;
  charges.forEach((c, i) => {
    track(c.amount, `charges[${i}].amount`);
    if (isMissing(c.amount) && isTax(c.kind)) taxUnreadable = true;
    else if (isMissing(c.amount)) warnings.push(warn('CHARGE_UNREADABLE', `The amount for "${c.label}" could not be read.`, `charges[${i}]`));
  });
  if (taxUnreadable) warnings.push(warn('TAX_PARTIAL', 'The tax section is partially unreadable.', 'charges'));
  const cgst = sumOf(charges, 'CGST');
  const sgst = sumOf(charges, 'SGST');
  if (cgst != null && sgst != null && cgst !== sgst) {
    warnings.push(warn('CGST_SGST_DIFFER', 'CGST and SGST differ; they are normally equal. Please verify the tax lines.', 'charges'));
    charges = charges.map((c, i) => {
      if (c.kind !== 'CGST' && c.kind !== 'SGST') return c;
      if (!isMissing(c.amount)) uncertain.add(`charges[${i}].amount`);
      return { ...c, amount: needsVerification(c.amount, 'CGST and SGST differ') };
    });
  }
  if (p.unclassifiedSummaryLines.length) {
    warnings.push(warn('UNRECOGNISED_LINES',
      `Some lines near the totals were not recognised: ${p.unclassifiedSummaryLines.slice(0, 3).join('; ')}. Add them as charges if needed.`, 'charges'));
  }

  // ---- totals ----
  track(subtotal, 'subtotal');
  if (isMissing(total)) {
    const cutOff = imageHeight > 0 && p.lastLineBottom > imageHeight * 0.96;
    if (cutOff || (p.itemsEndIdx < 0 && items.length)) warnings.push(warn('BOTTOM_CUT_OFF', 'The bottom section of the bill is not visible.', 'total'));
    warnings.push(warn('TOTAL_NOT_DETECTED', 'The final bill amount could not be detected.', 'total'));
    missing.add('total');
  } else {
    track(total, 'total');
  }

  // A misread amount ("1060.00" for "100.00") that disagrees with its own quantity × rate: if quantity × rate
  // is exactly what makes the items add up to the printed subtotal, use it (still marked for review).
  if (!isMissing(subtotal) && items.every((i) => !isMissing(i.amount))) {
    const target = cents(subtotal.value!);
    let sum = items.reduce((a, i) => a + cents(i.amount.value!), 0);
    items.forEach((it, i) => {
      if (sum === target || !it.amount.note?.startsWith('Quantity × rate') || isMissing(it.quantity) || isMissing(it.unitPrice)) return;
      const read = cents(it.amount.value!);
      const calc = cents(it.unitPrice.value!) * it.quantity.value!;
      if (sum - read + calc !== target) return;
      items[i] = { ...it, amount: { ...it.amount, value: format(calc), status: 'verify', note: `Read as ₹${it.amount.value}; using ${it.quantity.value} × ₹${it.unitPrice.value} = ₹${format(calc)}, which matches the subtotal` } };
      sum = target;
    });
  }
  const itemsSum = items.every((i) => !isMissing(i.amount)) ? items.reduce((a, i) => a + cents(i.amount.value!), 0) : null;
  const chargesSum = charges.every((c) => !isMissing(c.amount)) ? charges.reduce((a, c) => a + signedAmount(c), 0) : null;

  if (!isMissing(subtotal) && itemsSum != null && items.length && itemsSum !== cents(subtotal.value!)) {
    warnings.push(warn('SUBTOTAL_MISMATCH', `Items add up to ${rupees(itemsSum)} but the subtotal reads ₹${subtotal.value}. An item may be missing or misread.`, 'subtotal'));
    subtotal = needsVerification(subtotal, 'Does not match the sum of items');
    uncertain.add('subtotal');
  }
  if (!isMissing(total) && chargesSum != null) {
    const base = !isMissing(subtotal) ? cents(subtotal.value!) : itemsSum;
    if (base != null && base + chargesSum !== cents(total.value!)) {
      warnings.push(warn('TOTAL_MISMATCH', `Subtotal and charges add up to ${rupees(base + chargesSum)} but the final amount reads ₹${total.value}. Please check the totals.`, 'total'));
      total = needsVerification(total, 'Does not match subtotal + charges');
      uncertain.add('total');
    }
  }

  const restaurant = p.restaurantName ?? missingField<string>('Restaurant name not detected');
  const billNo = p.billNumber ?? missingField<string>('Bill number not detected');
  const date = p.billDate ?? missingField<string>('Bill date not detected');
  track(restaurant, 'restaurantName');
  track(billNo, 'billNumber');
  track(date, 'billDate');

  return {
    engine, imageQuality: quality, restaurantName: restaurant, billNumber: billNo, billDate: date, subtotal, total,
    items, charges, missingFields: [...missing], uncertainFields: [...uncertain], warnings, receiptId: null,
  };
}

function signedAmount(c: ExtractedCharge): number {
  const v = cents(c.amount.value!);
  return c.kind === 'DISCOUNT' ? -Math.abs(v) : v;
}

function sumOf(charges: ExtractedCharge[], kind: ExtractedChargeKind): number | null {
  let s: number | null = null;
  for (const c of charges) {
    if (c.kind !== kind || isMissing(c.amount)) continue;
    s = (s ?? 0) + cents(c.amount.value!);
  }
  return s;
}

/** A "GST" line equal to CGST + SGST is a summary of them, not an extra charge. */
function dropSummaryGst(charges: ExtractedCharge[], warnings: ExtractionWarningDto[]): ExtractedCharge[] {
  const cgst = sumOf(charges, 'CGST');
  const sgst = sumOf(charges, 'SGST');
  if (cgst == null || sgst == null) return charges;
  return charges.filter((c) => {
    if (c.kind === 'GST' && !isMissing(c.amount) && cents(c.amount.value!) === cgst + sgst) {
      warnings.push(warn('GST_SUMMARY_LINE', `"${c.label}" equals CGST + SGST, so it was treated as a summary and not added again.`));
      return false;
    }
    return true;
  });
}
