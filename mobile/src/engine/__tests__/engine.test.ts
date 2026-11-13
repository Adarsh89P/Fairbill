/// <reference types="jest" />
import { allocate, formatMoney, parseMoney, currencyFor, sum } from '../money';
import { computeSplit, findDuplicates, pendingReview } from '../split';
import { settle } from '../settle';
import { newBill, newCharge, newItem } from '../factory';
import type { Bill } from '../types';

function people(bill: Bill, ...names: string[]) {
  bill.participants = names.map((n) => ({ id: n.toLowerCase(), name: n }));
}
function assign(bill: Bill, itemIdx: number, ...ids: string[]) {
  bill.assignments[bill.items[itemIdx].id] = { mode: 'equal', shares: Object.fromEntries(ids.map((i) => [i, 1])) };
}

describe('money', () => {
  test('allocate always sums exactly', () => {
    for (let t = -1000; t <= 1000; t += 7) {
      for (const w of [[1, 1, 1], [1, 2], [3, 0, 5], [1, 1, 1, 1, 1, 1, 1]]) {
        expect(sum(allocate(t, w))).toBe(t);
      }
    }
  });
  test('allocate distributes remainder deterministically', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(10, [0, 1])).toEqual([0, 10]);
  });
  test('allocate rejects zero weights', () => {
    expect(() => allocate(10, [0, 0])).toThrow();
  });
  test('parseMoney is strict', () => {
    expect(parseMoney('1,234.50')).toBe(123450);
    expect(parseMoney('₹ 99')).toBe(9900);
    expect(parseMoney('Rs. 12.5')).toBe(1250);
    expect(parseMoney('-3.05')).toBe(-305);
    expect(parseMoney('12.345')).toBeNull(); // too many decimals: never round silently
    expect(parseMoney('12.300')).toBe(1230);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('500', currencyFor('JPY'))).toBe(500);
  });
  test('formatMoney uses Indian grouping', () => {
    expect(formatMoney(12345678)).toBe('₹1,23,456.78');
    expect(formatMoney(50000, undefined, { compact: true })).toBe('₹500');
    expect(formatMoney(-150)).toBe('−₹1.50');
  });
});

describe('split', () => {
  function sample(): Bill {
    const b = newBill('manual');
    b.items = [newItem('Chicken Biryani', 25000), newItem('Paneer Tikka', 30000), newItem('Cold Drink', 10000)];
    b.charges = [newCharge('CGST', 1500), newCharge('SGST', 1500)];
    b.total = { value: 68000, status: 'ok' };
    people(b, 'Adarsh', 'Rahul');
    assign(b, 0, 'adarsh');
    assign(b, 1, 'adarsh', 'rahul');
    assign(b, 2, 'rahul');
    return b;
  }

  test('matches the spec example', () => {
    const r = computeSplit(sample());
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    const [a, ra] = r.people;
    expect(a.itemsTotal).toBe(40000);
    expect(ra.itemsTotal).toBe(25000);
    expect(a.chargesTotal).toBe(1500); // GST equal by default
    expect(ra.chargesTotal).toBe(1500);
    expect(a.total + ra.total).toBe(68000);
  });

  test('proportional discount and odd paise reconcile exactly', () => {
    const b = sample();
    b.charges.push(newCharge('DISCOUNT', -3333), newCharge('ROUND_OFF', 33));
    b.total = { value: 68000 - 3333 + 33, status: 'ok' };
    const r = computeSplit(b);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(sum(r.people.map((p) => p.total))).toBe(b.total.value);
    // discount proportional to 400:250 consumption
    const disc = r.people.map((p) => p.lines.find((l) => l.chargeKind === 'DISCOUNT')!.amount);
    expect(sum(disc)).toBe(-3333);
    expect(disc[0]).toBe(-2051);
  });

  test('flags missing price, unassigned item and total mismatch', () => {
    const b = sample();
    b.items.push(newItem('Lassi', null));
    b.items.push(newItem('Naan', 4000));
    const codes = computeSplit(b).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['ITEM_NO_PRICE', 'ITEM_UNASSIGNED', 'TOTAL_MISMATCH']));
  });

  test('percent and quantity shares', () => {
    const b = sample();
    b.assignments[b.items[1].id] = { mode: 'percent', shares: { adarsh: 70, rahul: 30 } };
    b.items[0].quantity.value = 2;
    b.assignments[b.items[0].id] = { mode: 'quantity', shares: { adarsh: 1.5, rahul: 0.5 } };
    const r = computeSplit(b);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.people[0].itemsTotal).toBe(18750 + 21000);
    b.assignments[b.items[1].id] = { mode: 'percent', shares: { adarsh: 70, rahul: 20 } };
    expect(computeSplit(b).issues.map((i) => i.code)).toContain('PERCENT_NOT_100');
  });

  test('custom tip needs shares', () => {
    const b = sample();
    b.charges.push(newCharge('TIP', 5000));
    b.total.value = 73000;
    expect(computeSplit(b).issues.map((i) => i.code)).toContain('CUSTOM_NOT_SET');
    b.rules.TIP = { method: 'custom', custom: { adarsh: 1 } };
    const r = computeSplit(b);
    expect(r.people[0].chargesTotal).toBe(6500);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  test('duplicates detected, not removed', () => {
    const b = sample();
    b.items.push(newItem('cold  drink', 10000));
    const d = findDuplicates(b.items);
    expect(d.size).toBe(2);
    expect(b.items.length).toBe(4);
  });

  test('pending review blocks low-confidence fields', () => {
    const b = sample();
    b.items[2].amount = { value: 10000, status: 'verify', confidence: 0.4 };
    const p = pendingReview(b);
    expect(p.counts.needsVerification).toBe(1);
    expect(p.blocking.length).toBe(1);
  });
});

describe('settle', () => {
  test('single payer', () => {
    const b = newBill('manual');
    b.items = [newItem('A', 30000), newItem('B', 20000)];
    b.total = { value: 50000, status: 'ok' };
    people(b, 'X', 'Y', 'Z');
    b.assignments[b.items[0].id] = { mode: 'equal', shares: { x: 1, y: 1, z: 1 } };
    b.assignments[b.items[1].id] = { mode: 'equal', shares: { z: 1 } };
    b.payments = { x: 50000 };
    const s = settle(b, computeSplit(b));
    expect(s.issues).toEqual([]);
    expect(s.transfers).toEqual([
      expect.objectContaining({ from: 'z', to: 'x', amount: 30000 }),
      expect.objectContaining({ from: 'y', to: 'x', amount: 10000 }),
    ]);
  });
  test('multiple payers and settled flags', () => {
    const b = newBill('manual');
    b.items = [newItem('A', 90000)];
    b.total = { value: 90000, status: 'ok' };
    people(b, 'X', 'Y', 'Z');
    b.assignments[b.items[0].id] = { mode: 'equal', shares: { x: 1, y: 1, z: 1 } };
    b.payments = { x: 60000, y: 30000 };
    b.settled = { 'z->x': true };
    const s = settle(b, computeSplit(b));
    expect(s.transfers).toEqual([expect.objectContaining({ from: 'z', to: 'x', amount: 30000, settled: true })]);
    expect(s.balances.find((x) => x.participantId === 'z')!.pending).toBe(0);
  });
  test('payments must match total', () => {
    const b = newBill('manual');
    b.items = [newItem('A', 1000)];
    b.total = { value: 1000, status: 'ok' };
    people(b, 'X');
    b.assignments[b.items[0].id] = { mode: 'equal', shares: { x: 1 } };
    b.payments = { x: 900 };
    expect(settle(b, computeSplit(b)).issues.length).toBe(1);
  });
});

describe('extra not on the printed bill', () => {
  test('subtotal check ignores the included extra', () => {
    const { newBill, newItem, ok } = require('../factory');
    const { reconcile, extraNotOnBill } = require('../split');
    const b = newBill('manual');
    b.items = [newItem('Thali', 90000), newItem('Cake (bought outside)', 50000)];
    b.subtotal = ok(90000);
    b.printedTotal = 90000;
    b.total = ok(140000);
    expect(extraNotOnBill(b)).toBe(50000);
    const codes = reconcile(b, 140000, 140000).map((i: any) => i.code);
    expect(codes).not.toContain('SUBTOTAL_MISMATCH');
    expect(codes).not.toContain('TOTAL_MISMATCH');
  });
});
