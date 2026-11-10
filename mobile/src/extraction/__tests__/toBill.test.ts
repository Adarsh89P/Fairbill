/// <reference types="jest" />
import { extractionToBill } from '../toBill';
import type { ExtractionResult, ExtractedField } from '../types';

const f = (value: any, confidence: number, status: 'ok' | 'verify' | 'missing' = 'ok'): ExtractedField<any> => ({ value, confidence, status });

function result(): ExtractionResult {
  return {
    engine: 'test',
    imageQuality: { acceptable: true, width: 1000, height: 2000, sharpness: 300, brightness: 180, issues: [] },
    restaurantName: f('Spice Garden', 0.95),
    billNumber: f(null, 0, 'missing'),
    billDate: f('2025-09-14', 0.9),
    subtotal: f('900.00', 0.95),
    total: f('945.00', 0.95),
    items: [
      { name: f('Chicken Biryani', 0.96), quantity: f(2, 0.96), unitPrice: f('250.00', 0.9), amount: f('500.00', 0.96), lineText: '' },
      // Server says ok but confidence is low: must still be treated as unverified.
      { name: f('Paneer Tikka', 0.9), quantity: f(null, 0, 'missing'), unitPrice: f(null, 0, 'missing'), amount: f('300.00', 0.6), lineText: '' },
      { name: f('Cold Drink', 0.9), quantity: f(1, 0.9), unitPrice: f(null, 0, 'missing'), amount: f(null, 0, 'missing'), lineText: '' },
    ],
    charges: [
      { kind: 'CGST', label: 'CGST', amount: f('22.50', 0.95) },
      { kind: 'DISCOUNT', label: 'Discount', amount: f('50.00', 0.95) },
      { kind: 'SGST', label: 'SGST', amount: f('22.5O', 0.95) }, // unparseable -> missing, never guessed
    ],
    missingFields: [], uncertainFields: [], warnings: [{ code: 'IMAGE_BLURRY', message: 'The uploaded image is blurry.' }],
  };
}

test('maps extraction without trusting low confidence or inventing values', () => {
  const b = extractionToBill(result(), 'scan');
  expect(b.items[0].amount).toMatchObject({ value: 50000, status: 'ok' });
  expect(b.items[1].amount).toMatchObject({ value: 30000, status: 'verify' });
  expect(b.items[1].quantity).toMatchObject({ value: null, status: 'missing' });
  expect(b.items[2].amount).toMatchObject({ value: null, status: 'missing' });
  expect(b.charges[1].amount.value).toBe(-5000); // discounts reduce the bill
  expect(b.charges[2].amount).toMatchObject({ value: null, status: 'missing' });
  expect(b.total.value).toBe(94500);
  expect(b.billNumber.status).toBe('missing');
  expect(b.warnings[0].code).toBe('IMAGE_BLURRY');
});
