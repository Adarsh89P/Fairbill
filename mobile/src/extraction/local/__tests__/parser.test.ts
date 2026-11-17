/** Same cases as backend ReceiptParserTest.java, so the on-device reader matches the server. */
import { assembleLines } from '../lines';
import type { OcrLine, OcrWord } from '../model';
import { parseReceipt } from '../parser';
import { cleanNumber } from '../tokens';
import { validateReceipt } from '../validator';
import type { ImageQuality } from '../../types';

const GOOD: ImageQuality = { acceptable: true, width: 1000, height: 2000, sharpness: 300, brightness: 180, issues: [] };

function ocr(low: Record<string, number>, ...lines: string[]): OcrLine[] {
  let y = 10;
  return lines.map((l) => {
    let x = 10;
    const words: OcrWord[] = l.trim().split(/\s+/).map((w) => {
      const word = { text: w, confidence: low[w] ?? 0.96, box: { x, y, width: w.length * 12, height: 20 } };
      x += w.length * 12 + 10;
      return word;
    });
    y += 30;
    return { words };
  });
}

const run = (lines: OcrLine[]) => validateReceipt(parseReceipt(lines), GOOD, 'test', 2000);
const codes = (r: ReturnType<typeof run>) => r.warnings.map((w) => w.code);

test('parses a typical Indian bill', () => {
  const r = run(ocr({},
    'SPICE GARDEN RESTAURANT', 'MG Road, Bengaluru 560001', 'GSTIN: 29ABCDE1234F1Z5', 'TAX INVOICE',
    'Bill No: SG/2045   Date: 14/09/2025', 'Item Qty Rate Amount',
    'Chicken Biryani 2 250.00 500.00', 'Paneer Tikka 1 300.00 300.00', 'Cold Drink 2 50.00 100.00',
    'Sub Total 900.00', 'CGST @2.5% 22.50', 'SGST @2.5% 22.50', 'Service Charge 5% 45.00', 'Round Off -0.00',
    'Grand Total 990.00', 'Cash 1000.00', 'Thank you! Visit again'));
  expect(r.restaurantName.value).toBe('SPICE GARDEN RESTAURANT');
  expect(r.billNumber.value).toBe('SG/2045');
  expect(r.billDate.value).toBe('2025-09-14');
  expect(r.items).toHaveLength(3);
  expect(r.items[0].name.value).toBe('Chicken Biryani');
  expect(r.items[0].quantity.value).toBe(2);
  expect(r.items[0].amount.value).toBe('500.00');
  expect(r.items[0].amount.status).toBe('ok');
  expect(r.subtotal.value).toBe('900.00');
  expect(r.total.value).toBe('990.00');
  expect(r.total.status).toBe('ok');
  expect(r.charges.map((c) => c.kind)).toEqual(['CGST', 'SGST', 'SERVICE', 'ROUND_OFF']);
  expect(r.charges[0].rate).toBe('2.5%');
  expect(r.charges[2].amount.value).toBe('45.00');
  expect(codes(r)).not.toContain('TOTAL_MISMATCH');
  expect(codes(r)).not.toContain('SUBTOTAL_MISMATCH');
});

test('never invents an unreadable price and flags low confidence', () => {
  const r = run(ocr({ '300.00': 0.42 },
    'Cafe Mocha', 'Description Qty Amount', 'Masala Dosa 1 120.00', 'Filter Coffee', 'Paneer Butter Masala 1 300.00', 'Total 420.00'));
  expect(r.items).toHaveLength(3);
  expect(r.items[1].name.value).toBe('Filter Coffee');
  expect(r.items[1].amount.status).toBe('missing');
  expect(r.items[1].amount.value).toBeNull();
  expect(r.items[2].amount.status).toBe('verify');
  expect(r.warnings.map((w) => w.message)).toContain('The price of "Filter Coffee" is unclear.');
  expect(r.missingFields).toContain('items[1].amount');
  expect(r.uncertainFields).toContain('items[2].amount');
});

test('reports a missing total and a cut-off bottom', () => {
  const r = run(ocr({}, 'Udupi Grand', 'Item Qty Amount', 'Idli Vada 2 140.00', 'Coffee 2 60.00'));
  expect(r.total.status).toBe('missing');
  expect(codes(r)).toEqual(expect.arrayContaining(['TOTAL_NOT_DETECTED', 'BOTTOM_CUT_OFF']));
});

test('detects mismatches and duplicates', () => {
  const r = run(ocr({},
    'Dhaba 21', 'Particulars Qty Rate Amt', 'Butter Naan 2 40.00 80.00', 'Butter Naan 2 40.00 80.00', 'Dal Makhani 1 220.00 260.00',
    'Sub Total 440.00', 'CGST 2.5% 11.00', 'SGST 2.5% 12.00', 'Net Amount 463.00'));
  expect(codes(r)).toEqual(expect.arrayContaining(['POSSIBLE_DUPLICATE', 'CGST_SGST_DIFFER']));
  expect(r.items).toHaveLength(3);
  expect(r.items[2].amount.status).toBe('verify');
  expect(r.charges[0].amount.status).toBe('verify');
});

test('a plain total before taxes is the subtotal; discounts are parsed', () => {
  const r = run(ocr({},
    'Barbeque Bay', 'S.No Item Qty Amount', '1 Veg Platter 1 450.00', '2 Mocktail 2 300.00', 'Total 750.00', 'Discount 10% 75.00',
    'Packing Charges 20.00', 'CGST 2.5% 17.38', 'SGST 2.5% 17.38', 'Round Off 0.24', 'Net Payable 730.00'));
  expect(r.items[0].name.value).toBe('Veg Platter');
  expect(r.subtotal.value).toBe('750.00');
  expect(r.total.value).toBe('730.00');
  expect(r.charges.map((c) => c.kind)).toEqual(['DISCOUNT', 'PACKAGING', 'CGST', 'SGST', 'ROUND_OFF']);
  expect(codes(r)).not.toContain('TOTAL_MISMATCH');
});

test('item names that look like keywords stay items', () => {
  const r = run(ocr({}, 'Chai Point', 'Item Qty Amount', 'Sugar less Tea 2 60.00', 'Parcel Veg Biryani 1 180.00', 'Lassi 60.00 60.00', 'Total 300.00'));
  expect(r.items.map((i) => i.name.value)).toEqual(['Sugar less Tea', 'Parcel Veg Biryani', 'Lassi']);
  expect(r.items[2].quantity.status).toBe('missing');
  expect(r.charges).toHaveLength(0);
});

test('merges wrapped item names', () => {
  const r = run(ocr({}, 'Punjab Grill', 'Item Qty Rate Amount', 'Chicken Tikka Butter', 'Masala 1 380.00 380.00', 'Total 380.00'));
  expect(r.items).toHaveLength(1);
  expect(r.items[0].name.value).toBe('Chicken Tikka Butter Masala');
  expect(r.items[0].name.status).toBe('verify');
});

test('cleans Indian money tokens', () => {
  expect(cleanNumber('1,250.00')).toBe('1250.00');
  expect(cleanNumber('500/-')).toBe('500');
  expect(cleanNumber('Rs.99')).toBe('99');
  expect(cleanNumber('(-)0.40')).toBe('-0.40');
  expect(cleanNumber('?100.00')).toBe('100.00');
  expect(cleanNumber('1O0.00')).toBe('100.00');
  expect(cleanNumber('5%')).toBeNull();
  expect(cleanNumber('Biryani')).toBeNull();
});

test('groups a far-right price onto its item row', () => {
  const lines = assembleLines([
    { text: 'Tea', confidence: 0.9, box: { x: 10, y: 100, width: 40, height: 20 } },
    { text: '60.00', confidence: 0.9, box: { x: 500, y: 104, width: 60, height: 20 } },
    { text: 'Coffee', confidence: 0.9, box: { x: 10, y: 140, width: 70, height: 20 } },
  ]);
  expect(lines.map((l) => l.words.map((w) => w.text).join(' '))).toEqual(['Tea 60.00', 'Coffee']);
});

test('keeps a price on its item row when the photo is tilted', () => {
  // 3° tilt: the price 600 px to the right sits ~31 px lower than the name.
  const slope = Math.tan((3 * Math.PI) / 180);
  const at = (text: string, x: number, y: number) => ({ text, confidence: 0.9, box: { x, y: y + x * slope, width: 60, height: 20 } });
  const words = [at('Tea', 10, 100), at('60.00', 610, 100), at('Coffee', 10, 135), at('80.00', 610, 135)];
  const rows = (slope2: number) => assembleLines(words, slope2).map((l) => l.words.map((w) => w.text).join(' '));
  expect(rows(0)).not.toEqual(['Tea 60.00', 'Coffee 80.00']); // without tilt correction prices land on the wrong rows
  expect(rows(slope)).toEqual(['Tea 60.00', 'Coffee 80.00']);
});

test('uses quantity × rate when it is what makes the items match the subtotal', () => {
  const r = run(ocr({},
    'Spice Garden', 'Item Qty Rate Amount', 'Chicken Biryani 2 250.00 500.00', 'Cold Drink 2 50.00 1060.00', 'Sub Total 600.00', 'Grand Total 600.00'));
  expect(r.items[1].amount.value).toBe('100.00');
  expect(r.items[1].amount.status).toBe('verify');
  expect(r.items[1].amount.note).toContain('Read as ₹1060.00');
  expect(codes(r)).not.toContain('SUBTOTAL_MISMATCH');
});

test('leaves a qty × rate mismatch alone when it does not explain the subtotal', () => {
  const r = run(ocr({}, 'Dhaba', 'Item Qty Rate Amount', 'Dal Makhani 1 220.00 260.00', 'Sub Total 300.00', 'Grand Total 300.00'));
  expect(r.items[0].amount.value).toBe('260.00');
  expect(r.items[0].amount.status).toBe('verify');
});
